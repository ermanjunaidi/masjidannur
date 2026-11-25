package service

import (
	"bytes"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// The resident list round-trips through Excel: the template and an
// exported list can both be imported, duplicates are skipped.
func TestResidentExcel(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.Resident{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	svc := NewResidentService(repository.NewResidentRepository(db))
	sc := repository.Scope{OrgID: 1}
	masjid := &models.MasjidSettings{Name: "Masjid An-Nur"}

	if _, err := svc.Create(sc, &ResidentInput{Name: "  Bu   Siti ", RT: "2", RW: "05"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := svc.Create(sc, &ResidentInput{Name: "bu siti", RT: "02", RW: "5"}); !errors.Is(err, ErrResidentExists) {
		t.Fatalf("duplicate err = %v, want ErrResidentExists", err)
	}
	if _, err := svc.Create(sc, &ResidentInput{Name: " "}); !errors.Is(err, ErrRecipientRequired) {
		t.Fatalf("nameless err = %v", err)
	}

	// Fill the template like a user would and import it.
	tpl, err := svc.Template(masjid)
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	if out := os.Getenv("RESIDENT_TEMPLATE_SAMPLE"); out != "" {
		_ = os.WriteFile(out, tpl.Data, 0o644)
	}
	f, err := excelize.OpenReader(bytes.NewReader(tpl.Data))
	if err != nil {
		t.Fatalf("open template: %v", err)
	}
	first := residentHeaderRow + 1
	if v, _ := f.GetCellValue(residentSheet, cellRef(2, first)); !strings.HasPrefix(v, "Contoh:") {
		t.Fatalf("example row = %q", v)
	}
	fill := [][]any{
		{2, "Pak Ahmad", "01", "05", "Fakir"},
		{3, "Bu Siti", "02", "05", ""},   // already in the list
		{4, "Pak Budi", 3, 5, ""},        // numeric cells
		{5, "Pak Ahmad", "01", "05", ""}, // repeated in the file
		{6, "", "09", "09", "tanpa nama"},
	}
	for i, row := range fill {
		if err := f.SetSheetRow(residentSheet, cellRef(1, first+1+i), &row); err != nil {
			t.Fatalf("fill: %v", err)
		}
	}
	buf, _ := f.WriteToBuffer()
	res, err := svc.Import(sc, bytes.NewReader(buf.Bytes()))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if res.Created != 2 || res.Skipped != 2 {
		t.Fatalf("import result = %+v, want 2 created / 2 skipped", res)
	}
	list, _ := svc.List(sc)
	if len(list) != 3 {
		t.Fatalf("residents = %d, want 3", len(list))
	}
	// Ordered RW, RT, name; numeric cells normalised.
	if list[0].Name != "Pak Ahmad" || list[0].Note != "Fakir" || list[2].Name != "Pak Budi" || list[2].RT != "03" || list[2].RW != "05" {
		t.Fatalf("residents = %+v", list)
	}

	// Export → import again adds nothing.
	exp, err := svc.Export(sc, masjid)
	if err != nil || exp.Rows != 3 {
		t.Fatalf("export = %+v, err %v", exp, err)
	}
	if out := os.Getenv("RESIDENT_EXPORT_SAMPLE"); out != "" {
		_ = os.WriteFile(out, exp.Data, 0o644)
	}
	ef, _ := excelize.OpenReader(bytes.NewReader(exp.Data))
	if v, _ := ef.GetCellValue(residentSheet, cellRef(3, first)); v != "01" {
		t.Fatalf("exported RT = %q, want 01 (leading zero kept)", v)
	}
	if v, _ := ef.CalcCellValue("Rekap", "D7"); v != "3" {
		t.Fatalf("rekap total = %q, want 3", v)
	}
	again, err := svc.Import(sc, bytes.NewReader(exp.Data))
	if err != nil || again.Created != 0 || again.Skipped != 3 {
		t.Fatalf("re-import = %+v, err %v", again, err)
	}
	// Another organization does not see or collide with these.
	other, err := svc.Import(repository.Scope{OrgID: 2}, bytes.NewReader(exp.Data))
	if err != nil || other.Created != 3 {
		t.Fatalf("other org import = %+v, err %v", other, err)
	}
	if list, _ := svc.List(sc); len(list) != 3 {
		t.Fatalf("org 1 residents after other import = %d", len(list))
	}

	if _, err := svc.Import(sc, strings.NewReader("bukan excel")); !errors.Is(err, ErrImportInvalidFile) {
		t.Fatalf("garbage err = %v", err)
	}
	empty := excelize.NewFile()
	_ = empty.SetCellValue("Sheet1", "A1", "Kolom lain")
	eb, _ := empty.WriteToBuffer()
	if _, err := svc.Import(sc, bytes.NewReader(eb.Bytes())); !errors.Is(err, ErrImportNoHeader) {
		t.Fatalf("no header err = %v", err)
	}
}
