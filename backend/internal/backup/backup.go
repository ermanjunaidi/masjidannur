// Package backup implements full export / import (backup & restore) of the
// application database together with the uploaded files (images).
//
// Archive format (.zip):
//
//	manifest.json            — format, version, app, created_at, row counts
//	database/<table>.json    — JSON array, one object per row (row_to_json)
//	uploads/<path>           — every file under the uploads directory
//
// The dump is schema-agnostic: every base table in the current schema is
// exported, and on import only the columns that exist in both the archive
// and the live table are inserted (missing columns fall back to their
// defaults, unknown columns are ignored). That keeps backups restorable
// across app versions that only added columns/tables (GORM AutoMigrate).
//
// Restore is a FULL replace: every table is truncated and refilled inside a
// single transaction, and the uploads directory is replaced by the files in
// the archive. Before touching anything a safety snapshot of the current
// state is written to the backups directory so a bad restore can be undone.
//
// Only Postgres is supported.
package backup

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

const (
	formatName    = "app-backup"
	formatVersion = 1
	dbPrefix      = "database/"
	uploadsPrefix = "uploads/"
	manifestName  = "manifest.json"
	insertBatch   = 500
	keepSnapshots = 5
	restoreStage  = ".restore-uploads"
)

// Manifest is stored as manifest.json at the root of every archive.
type Manifest struct {
	Format    string           `json:"format"`
	Version   int              `json:"version"`
	App       string           `json:"app"`
	CreatedAt time.Time        `json:"created_at"`
	Tables    map[string]int64 `json:"tables"`
	Files     int              `json:"files"`
}

// RestoreResult summarises a finished import.
type RestoreResult struct {
	App             string   `json:"app"`
	BackupCreatedAt string   `json:"backup_created_at"`
	Tables          int      `json:"tables"`
	Rows            int64    `json:"rows"`
	Files           int      `json:"files"`
	SafetySnapshot  string   `json:"safety_snapshot"`
	Warnings        []string `json:"warnings"`
	ReplicationRole bool     `json:"-"`
}

// Snapshot is a backup archive kept on the server (backups directory).
type Snapshot struct {
	Name      string    `json:"name"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
}

// Service performs exports and imports. Only one operation runs at a time.
type Service struct {
	db           *gorm.DB
	app          string
	uploadsDir   string
	backupsDir   string
	afterRestore func() error
	mu           sync.Mutex
}

// NewService builds the backup service.
//   - app: short app id written to / checked against the manifest
//   - uploadsDir: directory served as /uploads (e.g. "uploads")
//   - backupsDir: where safety snapshots are kept (e.g. "backups")
//   - afterRestore: optional hook run after a successful restore (re-seed
//     RBAC / superadmin so the operator never locks themselves out)
func NewService(db *gorm.DB, app, uploadsDir, backupsDir string, afterRestore func() error) *Service {
	return &Service{db: db, app: app, uploadsDir: uploadsDir, backupsDir: backupsDir, afterRestore: afterRestore}
}

// App returns the app id used in manifests and file names.
func (s *Service) App() string { return s.app }

// ─── Export ──────────────────────────────────────────────────────────────────

// ExportToTemp writes a full backup to a temporary file and returns its
// path. The caller owns (and must remove) the file.
func (s *Service) ExportToTemp() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := os.CreateTemp("", s.app+"-backup-*.zip")
	if err != nil {
		return "", err
	}
	if err := s.export(f); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// FileName is the suggested download name for a fresh export.
func (s *Service) FileName(t time.Time) string {
	return fmt.Sprintf("%s-backup-%s.zip", s.app, t.Format("20060102-150405"))
}

func (s *Service) export(w io.Writer) error {
	zw := zip.NewWriter(w)
	man := Manifest{
		Format:    formatName,
		Version:   formatVersion,
		App:       s.app,
		CreatedAt: time.Now(),
		Tables:    map[string]int64{},
	}

	// One read-only REPEATABLE READ transaction = consistent snapshot of
	// every table, even while the app keeps serving writes.
	tx := s.db.Begin(&sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if tx.Error != nil {
		return tx.Error
	}
	defer tx.Rollback()

	tables, err := listTables(tx)
	if err != nil {
		return err
	}
	for _, t := range tables {
		n, err := exportTable(tx, zw, t)
		if err != nil {
			return fmt.Errorf("export tabel %s: %w", t, err)
		}
		man.Tables[t] = n
	}

	files, err := s.exportUploads(zw)
	if err != nil {
		return fmt.Errorf("export uploads: %w", err)
	}
	man.Files = files

	mw, err := createEntry(zw, manifestName)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(mw)
	enc.SetIndent("", "  ")
	if err := enc.Encode(man); err != nil {
		return err
	}
	return zw.Close()
}

func exportTable(tx *gorm.DB, zw *zip.Writer, table string) (int64, error) {
	w, err := createEntry(zw, dbPrefix+table+".json")
	if err != nil {
		return 0, err
	}
	rows, err := tx.Raw(`SELECT row_to_json(t)::text FROM ` + quoteIdent(table) + ` t`).Rows()
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var n int64
	if _, err := io.WriteString(w, "["); err != nil {
		return 0, err
	}
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return 0, err
		}
		sep := ",\n"
		if n == 0 {
			sep = "\n"
		}
		if _, err := io.WriteString(w, sep+line); err != nil {
			return 0, err
		}
		n++
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	_, err = io.WriteString(w, "\n]\n")
	return n, err
}

func (s *Service) exportUploads(zw *zip.Writer) (int, error) {
	info, err := os.Stat(s.uploadsDir)
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if !info.IsDir() {
		return 0, nil
	}
	count := 0
	err = filepath.WalkDir(s.uploadsDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.Type().IsRegular() {
			return nil // dirs are implicit; skip symlinks / devices
		}
		rel, err := filepath.Rel(s.uploadsDir, p)
		if err != nil {
			return err
		}
		fi, err := d.Info()
		if err != nil {
			return err
		}
		hdr, err := zip.FileInfoHeader(fi)
		if err != nil {
			return err
		}
		hdr.Name = uploadsPrefix + filepath.ToSlash(rel)
		hdr.Method = zip.Deflate
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			return err
		}
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		defer f.Close()
		if _, err := io.Copy(w, f); err != nil {
			return err
		}
		count++
		return nil
	})
	return count, err
}

// ─── Import ──────────────────────────────────────────────────────────────────

// Restore replaces the whole database and the uploads directory with the
// contents of the archive at zipPath.
func (s *Service) Restore(zipPath string) (*RestoreResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("file bukan arsip zip yang valid: %w", err)
	}
	defer zr.Close()

	man, tableFiles, uploadFiles, err := s.inspect(&zr.Reader)
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(s.backupsDir, 0o750); err != nil {
		return nil, err
	}

	// 1) Stage the uploads first: a corrupt archive fails here, before the
	//    database is touched.
	stage := filepath.Join(s.backupsDir, restoreStage)
	if err := os.RemoveAll(stage); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(stage, 0o755); err != nil {
		return nil, err
	}
	defer os.RemoveAll(stage)
	for rel, zf := range uploadFiles {
		if err := extractFile(zf, filepath.Join(stage, filepath.FromSlash(rel))); err != nil {
			return nil, fmt.Errorf("ekstrak %s: %w", rel, err)
		}
	}

	// 2) Safety snapshot of the current state.
	snapName := fmt.Sprintf("%s-pre-restore-%s.zip", s.app, time.Now().Format("20060102-150405"))
	snapPath := filepath.Join(s.backupsDir, snapName)
	if err := s.writeSnapshot(snapPath); err != nil {
		return nil, fmt.Errorf("gagal membuat snapshot pengaman: %w", err)
	}
	s.pruneSnapshots()

	// 3) Database.
	res := &RestoreResult{
		App:             man.App,
		BackupCreatedAt: man.CreatedAt.Format(time.RFC3339),
		Files:           len(uploadFiles),
		SafetySnapshot:  snapName,
		Warnings:        []string{},
	}
	if err := s.restoreDB(tableFiles, res); err != nil {
		return nil, err
	}

	// 4) Uploads: replace directory contents with the staged files.
	if err := replaceDirContents(s.uploadsDir, stage); err != nil {
		res.Warnings = append(res.Warnings, "database sudah dipulihkan, tetapi gagal mengganti folder uploads: "+err.Error())
	}

	// 5) Re-seed RBAC / superadmin.
	if s.afterRestore != nil {
		if err := s.afterRestore(); err != nil {
			res.Warnings = append(res.Warnings, "seed setelah restore gagal: "+err.Error())
		}
	}
	log.Printf("[backup] restore selesai: %d tabel, %d baris, %d file (snapshot pengaman: %s)", res.Tables, res.Rows, res.Files, snapName)
	return res, nil
}

func (s *Service) inspect(zr *zip.Reader) (*Manifest, map[string]*zip.File, map[string]*zip.File, error) {
	var manFile *zip.File
	tables := map[string]*zip.File{}
	uploads := map[string]*zip.File{}
	for _, f := range zr.File {
		name := f.Name
		if strings.HasSuffix(name, "/") {
			continue // directory entry
		}
		if strings.Contains(name, "\\") || strings.HasPrefix(name, "/") {
			return nil, nil, nil, fmt.Errorf("nama file tidak valid di arsip: %q", name)
		}
		clean := path.Clean(name)
		if clean != name || clean == ".." || strings.HasPrefix(clean, "../") || strings.Contains(clean, "/../") {
			return nil, nil, nil, fmt.Errorf("nama file tidak valid di arsip: %q", name)
		}
		switch {
		case name == manifestName:
			manFile = f
		case strings.HasPrefix(name, dbPrefix) && strings.HasSuffix(name, ".json"):
			t := strings.TrimSuffix(strings.TrimPrefix(name, dbPrefix), ".json")
			if t == "" || strings.Contains(t, "/") {
				return nil, nil, nil, fmt.Errorf("nama tabel tidak valid: %q", name)
			}
			tables[t] = f
		case strings.HasPrefix(name, uploadsPrefix):
			rel := strings.TrimPrefix(name, uploadsPrefix)
			if rel == "" {
				continue
			}
			uploads[rel] = f
		}
	}
	if manFile == nil {
		return nil, nil, nil, errors.New("manifest.json tidak ditemukan — bukan file backup aplikasi ini")
	}
	rc, err := manFile.Open()
	if err != nil {
		return nil, nil, nil, err
	}
	defer rc.Close()
	var man Manifest
	if err := json.NewDecoder(io.LimitReader(rc, 1<<20)).Decode(&man); err != nil {
		return nil, nil, nil, fmt.Errorf("manifest.json rusak: %w", err)
	}
	if man.Format != formatName {
		return nil, nil, nil, errors.New("format backup tidak dikenal")
	}
	if man.Version > formatVersion {
		return nil, nil, nil, fmt.Errorf("versi backup %d lebih baru dari yang didukung (%d)", man.Version, formatVersion)
	}
	if man.App != s.app {
		return nil, nil, nil, fmt.Errorf("backup ini milik aplikasi %q, bukan %q", man.App, s.app)
	}
	if len(tables) == 0 {
		return nil, nil, nil, errors.New("arsip tidak berisi data database")
	}
	return &man, tables, uploads, nil
}

func (s *Service) restoreDB(tableFiles map[string]*zip.File, res *RestoreResult) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Disabling FK triggers needs a superuser (the default for the
		// Postgres container). Without it, fall back to FK-ordered inserts.
		replica := tx.Exec("SAVEPOINT backup_repl").Error == nil &&
			tx.Session(&gorm.Session{Logger: gormlogger.Default.LogMode(gormlogger.Silent)}).
				Exec("SET LOCAL session_replication_role = replica").Error == nil
		if !replica {
			tx.Exec("ROLLBACK TO SAVEPOINT backup_repl")
		}
		res.ReplicationRole = replica

		tables, err := listTables(tx)
		if err != nil {
			return err
		}
		if len(tables) == 0 {
			return errors.New("database kosong — jalankan aplikasi sekali agar tabel dibuat")
		}
		quoted := make([]string, len(tables))
		for i, t := range tables {
			quoted[i] = quoteIdent(t)
		}
		if err := tx.Exec("TRUNCATE TABLE " + strings.Join(quoted, ", ") + " RESTART IDENTITY CASCADE").Error; err != nil {
			return fmt.Errorf("truncate: %w", err)
		}

		live := map[string]bool{}
		for _, t := range tables {
			live[t] = true
		}
		for t := range tableFiles {
			if !live[t] {
				res.Warnings = append(res.Warnings, "tabel "+t+" tidak ada di database ini — dilewati")
			}
		}

		order := tables
		if !replica {
			if order, err = fkOrder(tx, tables); err != nil {
				return err
			}
		}
		for _, t := range order {
			zf, ok := tableFiles[t]
			if !ok {
				continue
			}
			cols, err := tableColumns(tx, t)
			if err != nil {
				return err
			}
			n, skipped, err := importTable(tx, zf, t, cols)
			if err != nil {
				return fmt.Errorf("import tabel %s: %w", t, err)
			}
			if len(skipped) > 0 {
				res.Warnings = append(res.Warnings, fmt.Sprintf("tabel %s: kolom %s tidak ada di database ini — diabaikan", t, strings.Join(skipped, ", ")))
			}
			res.Tables++
			res.Rows += n
		}
		return resetSequences(tx)
	})
}

func importTable(tx *gorm.DB, zf *zip.File, table string, liveCols map[string]bool) (int64, []string, error) {
	rc, err := zf.Open()
	if err != nil {
		return 0, nil, err
	}
	defer rc.Close()
	dec := json.NewDecoder(rc)
	tok, err := dec.Token()
	if err != nil {
		return 0, nil, err
	}
	if d, ok := tok.(json.Delim); !ok || d != '[' {
		return 0, nil, errors.New("isi file bukan JSON array")
	}

	var (
		n       int64
		cols    []string
		skipped []string
		batch   []json.RawMessage
	)
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if len(cols) > 0 {
			var buf bytes.Buffer
			buf.WriteByte('[')
			for i, r := range batch {
				if i > 0 {
					buf.WriteByte(',')
				}
				buf.Write(r)
			}
			buf.WriteByte(']')
			colList := strings.Join(cols, ", ")
			q := "INSERT INTO " + quoteIdent(table) + " (" + colList + ") SELECT " + colList +
				" FROM json_populate_recordset(NULL::" + quoteIdent(table) + ", ?::json)"
			if err := tx.Exec(q, buf.String()).Error; err != nil {
				return err
			}
		}
		n += int64(len(batch))
		batch = batch[:0]
		return nil
	}

	for dec.More() {
		var row json.RawMessage
		if err := dec.Decode(&row); err != nil {
			return 0, nil, err
		}
		if cols == nil {
			var keys map[string]json.RawMessage
			if err := json.Unmarshal(row, &keys); err != nil {
				return 0, nil, errors.New("baris bukan objek JSON")
			}
			cols = []string{}
			names := make([]string, 0, len(keys))
			for k := range keys {
				names = append(names, k)
			}
			sort.Strings(names)
			for _, k := range names {
				if liveCols[k] {
					cols = append(cols, quoteIdent(k))
				} else {
					skipped = append(skipped, k)
				}
			}
		}
		batch = append(batch, row)
		if len(batch) >= insertBatch {
			if err := flush(); err != nil {
				return 0, nil, err
			}
		}
	}
	if err := flush(); err != nil {
		return 0, nil, err
	}
	return n, skipped, nil
}

// ─── Snapshots on the server ─────────────────────────────────────────────────

var snapshotNameRe = regexp.MustCompile(`^[A-Za-z0-9._-]+\.zip$`)

// SnapshotPath validates name and returns its path inside the backups dir.
func (s *Service) SnapshotPath(name string) (string, error) {
	if !snapshotNameRe.MatchString(name) || strings.HasPrefix(name, ".") {
		return "", errors.New("nama snapshot tidak valid")
	}
	p := filepath.Join(s.backupsDir, name)
	if _, err := os.Stat(p); err != nil {
		return "", errors.New("snapshot tidak ditemukan")
	}
	return p, nil
}

// ListSnapshots returns the archives in the backups directory, newest first.
func (s *Service) ListSnapshots() ([]Snapshot, error) {
	entries, err := os.ReadDir(s.backupsDir)
	if errors.Is(err, fs.ErrNotExist) {
		return []Snapshot{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []Snapshot{}
	for _, e := range entries {
		if !e.Type().IsRegular() || !snapshotNameRe.MatchString(e.Name()) || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Snapshot{Name: e.Name(), Size: fi.Size(), CreatedAt: fi.ModTime()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// CreateSnapshot saves a full backup in the backups directory.
func (s *Service) CreateSnapshot() (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.backupsDir, 0o750); err != nil {
		return nil, err
	}
	now := time.Now()
	name := s.FileName(now)
	p := filepath.Join(s.backupsDir, name)
	if err := s.writeSnapshot(p); err != nil {
		return nil, err
	}
	fi, err := os.Stat(p)
	if err != nil {
		return nil, err
	}
	return &Snapshot{Name: name, Size: fi.Size(), CreatedAt: fi.ModTime()}, nil
}

// DeleteSnapshot removes one archive from the backups directory.
func (s *Service) DeleteSnapshot(name string) error {
	p, err := s.SnapshotPath(name)
	if err != nil {
		return err
	}
	return os.Remove(p)
}

func (s *Service) writeSnapshot(dst string) error {
	tmp := dst + ".part"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	if err := s.export(f); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}

// pruneSnapshots keeps only the newest automatic pre-restore snapshots.
func (s *Service) pruneSnapshots() {
	list, err := s.ListSnapshots()
	if err != nil {
		return
	}
	kept := 0
	for _, sn := range list {
		if !strings.Contains(sn.Name, "-pre-restore-") {
			continue
		}
		kept++
		if kept > keepSnapshots {
			os.Remove(filepath.Join(s.backupsDir, sn.Name))
		}
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func createEntry(zw *zip.Writer, name string) (io.Writer, error) {
	return zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: time.Now()})
}

func quoteIdent(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
}

func listTables(tx *gorm.DB) ([]string, error) {
	var tables []string
	err := tx.Raw(`SELECT table_name FROM information_schema.tables
		WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
		ORDER BY table_name`).Scan(&tables).Error
	return tables, err
}

func tableColumns(tx *gorm.DB, table string) (map[string]bool, error) {
	var cols []string
	err := tx.Raw(`SELECT column_name FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = ?
		  AND is_generated = 'NEVER'
		  AND COALESCE(identity_generation, '') <> 'ALWAYS'`, table).Scan(&cols).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(cols))
	for _, c := range cols {
		out[c] = true
	}
	return out, nil
}

// fkOrder sorts tables so referenced tables come before the tables that
// reference them. Cycles are appended in name order.
func fkOrder(tx *gorm.DB, tables []string) ([]string, error) {
	var edges []struct {
		Child  string
		Parent string
	}
	err := tx.Raw(`SELECT cl.relname AS child, cf.relname AS parent
		FROM pg_constraint c
		JOIN pg_class cl ON cl.oid = c.conrelid
		JOIN pg_class cf ON cf.oid = c.confrelid
		JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE c.contype = 'f' AND n.nspname = current_schema()`).Scan(&edges).Error
	if err != nil {
		return nil, err
	}
	deps := map[string]map[string]bool{}
	for _, e := range edges {
		if e.Child == e.Parent {
			continue
		}
		if deps[e.Child] == nil {
			deps[e.Child] = map[string]bool{}
		}
		deps[e.Child][e.Parent] = true
	}
	done := map[string]bool{}
	var out []string
	for len(out) < len(tables) {
		progressed := false
		for _, t := range tables {
			if done[t] {
				continue
			}
			ready := true
			for p := range deps[t] {
				if !done[p] {
					ready = false
					break
				}
			}
			if ready {
				done[t] = true
				out = append(out, t)
				progressed = true
			}
		}
		if !progressed {
			for _, t := range tables {
				if !done[t] {
					done[t] = true
					out = append(out, t)
				}
			}
		}
	}
	return out, nil
}

// resetSequences moves every serial/identity sequence past MAX(column).
func resetSequences(tx *gorm.DB) error {
	var seqs []struct {
		TableName  string
		ColumnName string
		Seq        string
	}
	err := tx.Raw(`SELECT c.table_name, c.column_name,
			pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq
		FROM information_schema.columns c
		JOIN information_schema.tables t
		  ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
		WHERE c.table_schema = current_schema()
		  AND pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) IS NOT NULL`).Scan(&seqs).Error
	if err != nil {
		return err
	}
	for _, s := range seqs {
		q := `SELECT setval(?, COALESCE((SELECT MAX(` + quoteIdent(s.ColumnName) + `) FROM ` + quoteIdent(s.TableName) + `), 0) + 1, false)`
		if err := tx.Exec(q, s.Seq).Error; err != nil {
			return fmt.Errorf("reset sequence %s: %w", s.Seq, err)
		}
	}
	return nil
}

func extractFile(zf *zip.File, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	rc, err := zf.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, rc); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	if !zf.Modified.IsZero() {
		_ = os.Chtimes(dst, zf.Modified, zf.Modified)
	}
	return nil
}

// replaceDirContents empties dir and moves every entry of src into it.
// Works when dir is a mount point (the dir itself is never renamed).
func replaceDirContents(dir, src string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	old, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range old {
		if err := os.RemoveAll(filepath.Join(dir, e.Name())); err != nil {
			return err
		}
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		from := filepath.Join(src, e.Name())
		to := filepath.Join(dir, e.Name())
		if err := os.Rename(from, to); err != nil {
			if err := copyTree(from, to); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if !d.Type().IsRegular() {
			return nil
		}
		in, err := os.Open(p)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, in); err != nil {
			out.Close()
			return err
		}
		return out.Close()
	})
}
