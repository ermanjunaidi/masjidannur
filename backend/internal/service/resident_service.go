package service

import (
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"backend/internal/models"
	"backend/internal/repository"
)

// Limits of one resident import.
const (
	MaxResidentImportBytes = 2 << 20 // 2 MB
	MaxResidentImportRows  = 5000
)

var (
	ErrResidentNotFound   = errors.New("warga tidak ditemukan")
	ErrResidentExists     = errors.New("warga dengan nama, RT, dan RW yang sama sudah ada")
	ErrImportInvalidFile  = errors.New("file tidak bisa dibaca; unggah file Excel (.xlsx), sebaiknya dari template")
	ErrImportNoHeader     = errors.New("kolom \"Nama\" tidak ditemukan; gunakan template yang disediakan")
	ErrImportTooManyRows  = fmt.Errorf("terlalu banyak baris (maksimal %d warga per file)", MaxResidentImportRows)
	ErrImportTooLarge     = errors.New("ukuran file terlalu besar (maksimal 2 MB)")
	residentExamplePrefix = "contoh:"
)

// ResidentService handles the resident list (daftar warga).
type ResidentService struct {
	repo *repository.ResidentRepository
}

// NewResidentService wires the dependency.
func NewResidentService(repo *repository.ResidentRepository) *ResidentService {
	return &ResidentService{repo: repo}
}

// ResidentInput is the payload for creating/editing a resident.
type ResidentInput struct {
	Name string `json:"name"`
	RT   string `json:"rt"`
	RW   string `json:"rw"`
	Note string `json:"note"`
}

// NormalizeRTRW trims an RT/RW number and pads a single digit to two
// ("1" → "01"), so "1" typed by hand and "01" from Excel are the same RT.
func NormalizeRTRW(s string) string {
	s = strings.TrimSpace(s)
	// Excel may hand a numeric cell back as "1.0".
	if i := strings.Index(s, "."); i > 0 && strings.Trim(s[i+1:], "0") == "" {
		s = s[:i]
	}
	if len(s) == 1 && s[0] >= '0' && s[0] <= '9' {
		return "0" + s
	}
	return s
}

func residentKey(name, rt, rw string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " ")) + "|" + rt + "|" + rw
}

// List returns every resident of the org/branch.
func (s *ResidentService) List(sc repository.Scope) ([]models.Resident, error) {
	return s.repo.FindAll(sc.OrgID, sc.BranchID)
}

func (s *ResidentService) existingKeys(sc repository.Scope, exceptID uint) (map[string]bool, error) {
	list, err := s.repo.FindAll(sc.OrgID, sc.BranchID)
	if err != nil {
		return nil, err
	}
	keys := make(map[string]bool, len(list))
	for _, r := range list {
		if r.ID != exceptID {
			keys[residentKey(r.Name, r.RT, r.RW)] = true
		}
	}
	return keys, nil
}

// Create adds one resident; the same name in the same RT/RW is rejected.
func (s *ResidentService) Create(sc repository.Scope, in *ResidentInput) (*models.Resident, error) {
	res := &models.Resident{OrganizationID: sc.OrgID, BranchID: sc.BranchID}
	if err := s.apply(sc, res, in); err != nil {
		return nil, err
	}
	if err := s.repo.Create(res); err != nil {
		return nil, err
	}
	return res, nil
}

// Update edits a resident.
func (s *ResidentService) Update(sc repository.Scope, id uint, in *ResidentInput) (*models.Resident, error) {
	res, err := s.repo.FindByID(id, sc.OrgID, sc.BranchID)
	if err != nil {
		return nil, err
	}
	if res == nil {
		return nil, ErrResidentNotFound
	}
	if err := s.apply(sc, res, in); err != nil {
		return nil, err
	}
	if err := s.repo.Update(res); err != nil {
		return nil, err
	}
	return res, nil
}

func (s *ResidentService) apply(sc repository.Scope, res *models.Resident, in *ResidentInput) error {
	name := strings.Join(strings.Fields(in.Name), " ")
	if name == "" {
		return ErrRecipientRequired
	}
	rt, rw := NormalizeRTRW(in.RT), NormalizeRTRW(in.RW)
	keys, err := s.existingKeys(sc, res.ID)
	if err != nil {
		return err
	}
	if keys[residentKey(name, rt, rw)] {
		return ErrResidentExists
	}
	res.Name, res.RT, res.RW, res.Note = name, rt, rw, strings.TrimSpace(in.Note)
	return nil
}

// Delete removes a resident. Distributions already recorded for them keep
// their own copy of the name/RT/RW.
func (s *ResidentService) Delete(sc repository.Scope, id uint) error {
	res, err := s.repo.FindByID(id, sc.OrgID, sc.BranchID)
	if err != nil {
		return err
	}
	if res == nil {
		return nil
	}
	return s.repo.Delete(id)
}

// ─── Excel: export, template, import ──────────────────────────────────────────

const (
	residentSheet     = "Daftar Warga"
	residentHeaderRow = 5
)

var residentColumns = []struct {
	title string
	width float64
	align string
}{
	{"No", 6, "center"}, {"Nama", 36, "left"}, {"RT", 8, "center"}, {"RW", 8, "center"}, {"Keterangan", 40, "left"},
}

// residentWorkbook lays out the shared export/template sheet: kop, a
// green header row, text-formatted RT/RW columns (so "01" keeps its zero),
// frozen header and A4 print setup. It returns the builder positioned for
// data rows starting at residentHeaderRow+1.
func residentWorkbook(masjidName, subtitle string) *xlBook {
	f := excelize.NewFile()
	b := &xlBook{f: f, styles: map[xlStyle]int{}}
	b.keep(f.SetSheetName("Sheet1", residentSheet))
	last := len(residentColumns)
	for i, c := range residentColumns {
		col, _ := excelize.ColumnNumberToName(i + 1)
		b.keep(f.SetColWidth(residentSheet, col, col, c.width))
	}
	// Whole RT/RW columns are text so typed "01" is not turned into 1.
	b.keep(f.SetColStyle(residentSheet, "C:D", b.style(xlStyle{align: "center", numFmt: "@"})))

	b.band(residentSheet, 1, 1, last, masjidName, xlStyle{bold: true, size: 16, color: xlGreen})
	b.band(residentSheet, 2, 1, last, "DAFTAR WARGA", xlStyle{bold: true, size: 12})
	b.band(residentSheet, 3, 1, last, subtitle, xlStyle{size: 9, color: xlMuted})
	b.keep(f.SetRowHeight(residentSheet, 1, 26))
	b.keep(f.SetRowHeight(residentSheet, 2, 20))
	for i, c := range residentColumns {
		b.set(residentSheet, i+1, residentHeaderRow, c.title, xlStyle{bold: true, color: "FFFFFF", fill: xlGreen, align: c.align, border: true})
	}
	b.keep(f.SetRowHeight(residentSheet, residentHeaderRow, 24))

	b.keep(f.SetPanes(residentSheet, &excelize.Panes{
		Freeze: true, YSplit: residentHeaderRow, TopLeftCell: cellRef(1, residentHeaderRow+1), ActivePane: "bottomLeft",
	}))
	b.keep(f.SetSheetView(residentSheet, 0, &excelize.ViewOptions{ShowGridLines: ptr(false)}))
	b.keep(f.SetSheetProps(residentSheet, &excelize.SheetPropsOptions{FitToPage: ptr(true)}))
	b.keep(f.SetPageLayout(residentSheet, &excelize.PageLayoutOptions{
		Size: ptr(9), Orientation: ptr("portrait"), FitToWidth: ptr(1), FitToHeight: ptr(0),
	}))
	b.keep(f.SetPageMargins(residentSheet, &excelize.PageLayoutMarginsOptions{
		Left: ptr(0.5), Right: ptr(0.5), Top: ptr(0.5), Bottom: ptr(0.6), Header: ptr(0.3), Footer: ptr(0.3),
	}))
	b.keep(f.SetHeaderFooter(residentSheet, &excelize.HeaderFooterOptions{
		OddFooter: "&L&8" + strings.ReplaceAll(masjidName, "&", "&&") + "&R&8Halaman &P dari &N",
	}))
	b.keep(f.SetDefinedName(&excelize.DefinedName{
		Name: "_xlnm.Print_Titles", Scope: residentSheet,
		RefersTo: fmt.Sprintf("'%s'!$%d:$%d", residentSheet, residentHeaderRow, residentHeaderRow),
	}))
	return b
}

// residentRow writes one bordered data row (zebra on odd indexes).
func (b *xlBook) residentRow(row, index int, no any, name, rt, rw, note string, extra xlStyle) {
	fill := ""
	if index%2 == 1 {
		fill = xlZebra
	}
	st := func(align, numFmt string, wrap bool) xlStyle {
		s := extra
		s.fill, s.border, s.align, s.numFmt, s.wrap, s.valign = fill, true, align, numFmt, wrap, "top"
		return s
	}
	b.set(residentSheet, 1, row, no, st("center", "", false))
	b.set(residentSheet, 2, row, name, st("left", "", true))
	b.set(residentSheet, 3, row, rt, st("center", "@", false))
	b.set(residentSheet, 4, row, rw, st("center", "@", false))
	b.set(residentSheet, 5, row, note, st("left", "", true))
}

func (b *xlBook) finish(name string) (*ExportFile, error) {
	defer b.f.Close()
	if b.err != nil {
		return nil, b.err
	}
	buf, err := b.f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return &ExportFile{Name: name, Data: buf.Bytes()}, nil
}

func masjidNameOf(masjid *models.MasjidSettings) string {
	if masjid != nil && strings.TrimSpace(masjid.Name) != "" {
		return masjid.Name
	}
	return "Masjid"
}

// Export builds the resident list workbook. It has the same columns as
// the template, so an exported file can be edited and imported again.
func (s *ResidentService) Export(sc repository.Scope, masjid *models.MasjidSettings) (*ExportFile, error) {
	list, err := s.repo.FindAll(sc.OrgID, sc.BranchID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	b := residentWorkbook(masjidNameOf(masjid),
		fmt.Sprintf("%d warga   •   Dicetak: %s %s", len(list), longDateID(now), now.Format("15:04")))
	for i, r := range list {
		b.residentRow(residentHeaderRow+1+i, i, i+1, r.Name, r.RT, r.RW, r.Note, xlStyle{})
	}
	if len(list) > 0 {
		b.keep(b.f.AutoFilter(residentSheet,
			cellRef(1, residentHeaderRow)+":"+cellRef(len(residentColumns), residentHeaderRow+len(list)), nil))
	}
	// Rekap per RW/RT di sheet kedua.
	b.residentRecap(list)
	file, err := b.finish("daftar-warga-" + now.Format("2006-01-02") + ".xlsx")
	if file != nil {
		file.Rows = len(list)
	}
	return file, err
}

// residentRecap adds a "Rekap" sheet counting residents per RW and RT.
func (b *xlBook) residentRecap(list []models.Resident) {
	const sheet = "Rekap"
	_, err := b.f.NewSheet(sheet)
	b.keep(err)
	for i, w := range []float64{6, 12, 12, 16} {
		col, _ := excelize.ColumnNumberToName(i + 1)
		b.keep(b.f.SetColWidth(sheet, col, col, w))
	}
	b.band(sheet, 1, 1, 4, "Rekap warga per RW / RT", xlStyle{bold: true, size: 12, color: xlGreen})
	for i, h := range []string{"No", "RW", "RT", "Jumlah Warga"} {
		align := "center"
		if i == 3 {
			align = "right"
		}
		b.set(sheet, i+1, 3, h, xlStyle{bold: true, color: "FFFFFF", fill: xlGreen, align: align, border: true})
	}
	// list is already ordered by RW, RT.
	type group struct {
		rw, rt string
		n      int
	}
	var groups []group
	for _, r := range list {
		if n := len(groups); n > 0 && groups[n-1].rw == r.RW && groups[n-1].rt == r.RT {
			groups[n-1].n++
			continue
		}
		groups = append(groups, group{r.RW, r.RT, 1})
	}
	row := 4
	for i, g := range groups {
		fill := ""
		if i%2 == 1 {
			fill = xlZebra
		}
		b.set(sheet, 1, row, i+1, xlStyle{align: "center", fill: fill, border: true})
		b.set(sheet, 2, row, orDefault(g.rw, "-"), xlStyle{align: "center", numFmt: "@", fill: fill, border: true})
		b.set(sheet, 3, row, orDefault(g.rt, "-"), xlStyle{align: "center", numFmt: "@", fill: fill, border: true})
		b.set(sheet, 4, row, g.n, xlStyle{align: "right", fill: fill, border: true})
		row++
	}
	total := xlStyle{bold: true, fill: xlGreenSoft, border: true}
	b.band(sheet, row, 1, 3, "Total", total)
	total.align = "right"
	if len(groups) > 0 {
		b.formula(sheet, 4, row, fmt.Sprintf("SUM(D4:D%d)", row-1), total)
	} else {
		b.set(sheet, 4, row, 0, total)
	}
	b.keep(b.f.SetSheetView(sheet, 0, &excelize.ViewOptions{ShowGridLines: ptr(false)}))
}

// Template builds the empty import template: the list sheet with one
// example row and ready-to-fill bordered rows, plus a "Petunjuk" sheet.
func (s *ResidentService) Template(masjid *models.MasjidSettings) (*ExportFile, error) {
	b := residentWorkbook(masjidNameOf(masjid),
		"Template import — isi mulai baris di bawah judul kolom, lalu unggah lewat tombol Import. Baris contoh diabaikan.")
	first := residentHeaderRow + 1
	b.residentRow(first, 0, 1, "Contoh: Ahmad Fauzi", "01", "05", "Hapus atau timpa baris contoh ini",
		xlStyle{italic: true, color: xlMuted})
	const blankRows = 200
	for i := 1; i <= blankRows; i++ {
		b.residentRow(first+i, i, i+1, "", "", "", "", xlStyle{})
	}
	// Panduan singkat saat sel dipilih.
	for _, v := range []struct{ col, title, text string }{
		{"B", "Nama (wajib)", "Nama lengkap warga. Baris tanpa nama dilewati."},
		{"C", "RT", "Nomor RT, mis. 01. Boleh dikosongkan."},
		{"D", "RW", "Nomor RW, mis. 05. Boleh dikosongkan."},
	} {
		dv := excelize.NewDataValidation(true)
		dv.Sqref = fmt.Sprintf("%s%d:%s%d", v.col, first, v.col, first+blankRows)
		dv.SetInput(v.title, v.text)
		b.keep(b.f.AddDataValidation(residentSheet, dv))
	}

	const guide = "Petunjuk"
	_, err := b.f.NewSheet(guide)
	b.keep(err)
	b.keep(b.f.SetColWidth(guide, "A", "A", 5))
	b.keep(b.f.SetColWidth(guide, "B", "B", 100))
	b.band(guide, 1, 1, 2, "Cara mengisi template daftar warga", xlStyle{bold: true, size: 13, color: xlGreen})
	steps := []string{
		"Isi sheet \"Daftar Warga\" mulai baris pertama di bawah judul kolom. Satu baris untuk satu warga.",
		"Kolom Nama wajib diisi. RT, RW, dan Keterangan boleh dikosongkan.",
		"RT dan RW diketik apa adanya, mis. 01 atau 001. Angka satu digit otomatis menjadi dua digit (1 menjadi 01).",
		"Kolom No hanya untuk urutan dan tidak dibaca saat import.",
		"Jangan mengubah atau menghapus baris judul kolom (No, Nama, RT, RW, Keterangan).",
		"Baris contoh (nama diawali \"Contoh:\") dan baris tanpa nama dilewati.",
		"Warga dengan nama, RT, dan RW yang sama dengan data yang sudah ada tidak ditambahkan dua kali.",
		fmt.Sprintf("Simpan sebagai .xlsx (maksimal %d warga per file), lalu unggah lewat tombol Import di menu Pembagian Warga → Daftar Warga.", MaxResidentImportRows),
		"File hasil Export memakai susunan kolom yang sama, jadi bisa diedit lalu di-import kembali.",
	}
	for i, t := range steps {
		b.set(guide, 1, 3+i, i+1, xlStyle{align: "center", valign: "top"})
		b.set(guide, 2, 3+i, t, xlStyle{wrap: true, valign: "top"})
	}
	b.keep(b.f.SetSheetView(guide, 0, &excelize.ViewOptions{ShowGridLines: ptr(false)}))
	return b.finish("template-daftar-warga.xlsx")
}

// ImportResult reports what an import did.
type ImportResult struct {
	Created   int      `json:"created"`
	Skipped   int      `json:"skipped"`   // already in the list or repeated in the file
	Residents []string `json:"residents"` // names added (first 20)
}

// Import reads residents from an .xlsx file (the template or an exported
// list). The header row is found by its "Nama" column, so title rows above
// it do not matter. Residents already in the list are skipped.
func (s *ResidentService) Import(sc repository.Scope, file io.Reader) (*ImportResult, error) {
	f, err := excelize.OpenReader(io.LimitReader(file, MaxResidentImportBytes+1))
	if err != nil {
		return nil, ErrImportInvalidFile
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, ErrImportInvalidFile
	}
	sheet := sheets[0]
	for _, name := range sheets {
		if strings.EqualFold(name, residentSheet) {
			sheet = name
		}
	}
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, ErrImportInvalidFile
	}

	// Locate the header row and its columns.
	header, cols := -1, map[string]int{}
	for i, row := range rows {
		found := map[string]int{}
		for j, cell := range row {
			switch c := strings.ToLower(strings.TrimSpace(cell)); {
			case c == "nama" || strings.HasPrefix(c, "nama "):
				found["name"] = j
			case c == "rt":
				found["rt"] = j
			case c == "rw":
				found["rw"] = j
			case c == "keterangan" || c == "catatan":
				found["note"] = j
			}
		}
		if _, ok := found["name"]; ok {
			header, cols = i, found
			break
		}
		if i > 30 {
			break
		}
	}
	if header < 0 {
		return nil, ErrImportNoHeader
	}
	cell := func(row []string, key string) string {
		j, ok := cols[key]
		if !ok || j >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[j])
	}

	keys, err := s.existingKeys(sc, 0)
	if err != nil {
		return nil, err
	}
	res := &ImportResult{Residents: []string{}}
	var add []models.Resident
	for _, row := range rows[header+1:] {
		name := strings.Join(strings.Fields(cell(row, "name")), " ")
		if name == "" || strings.HasPrefix(strings.ToLower(name), residentExamplePrefix) {
			continue
		}
		rt, rw := NormalizeRTRW(cell(row, "rt")), NormalizeRTRW(cell(row, "rw"))
		key := residentKey(name, rt, rw)
		if keys[key] {
			res.Skipped++
			continue
		}
		keys[key] = true
		if len(add) >= MaxResidentImportRows {
			return nil, ErrImportTooManyRows
		}
		add = append(add, models.Resident{
			OrganizationID: sc.OrgID, BranchID: sc.BranchID,
			Name: truncateRunes(name, 255), RT: truncateRunes(rt, 10), RW: truncateRunes(rw, 10),
			Note: truncateRunes(cell(row, "note"), 500),
		})
		if len(res.Residents) < 20 {
			res.Residents = append(res.Residents, name)
		}
	}
	if err := s.repo.CreateMany(add); err != nil {
		return nil, err
	}
	res.Created = len(add)
	return res, nil
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) > max {
		return string(r[:max])
	}
	return s
}
