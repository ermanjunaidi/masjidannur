package service

import (
	"bytes"
	"errors"
	"os"
	"testing"

	"github.com/xuri/excelize/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// The export must contain every matching row (not just the list page),
// respect the book lock, and total up through its formulas.
func TestExportTransactions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Role{}, &models.Permission{},
		&models.Book{}, &models.Category{}, &models.Transaction{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	bookRepo := repository.NewBookRepository(db)
	catRepo := repository.NewCategoryRepository(db)
	txs := NewTransactionService(repository.NewTransactionRepository(db), catRepo, bookRepo)
	books := NewBookService(bookRepo)
	cats := NewCategoryService(catRepo, bookRepo)

	all := repository.Scope{OrgID: 1}
	bookA, _ := books.CreateBook(&CreateBookInput{Name: "Operasional"}, all)
	bookB, _ := books.CreateBook(&CreateBookInput{Name: "Pembangunan"}, all)
	infaq, _ := cats.CreateCategory(&CreateCategoryInput{BookID: bookA.ID, Name: "Infaq Jumat", Group: "pendapatan"}, all)
	listrik, _ := cats.CreateCategory(&CreateCategoryInput{BookID: bookA.ID, Name: "Listrik", Group: "pengeluaran"}, all)
	donasi, _ := cats.CreateCategory(&CreateCategoryInput{BookID: bookB.ID, Name: "Donasi", Group: "pendapatan"}, all)

	// More rows than the list endpoint's 1000-row cap.
	const n = 1200
	rows := make([]models.Transaction, 0, n+2)
	for i := 0; i < n; i++ {
		rows = append(rows, models.Transaction{
			OrganizationID: 1, BookID: bookA.ID, CategoryID: infaq.ID,
			Date: "2026-10-01", Type: "pemasukan", Amount: 1000, Description: "Infaq",
		})
	}
	rows = append(rows,
		models.Transaction{OrganizationID: 1, BookID: bookA.ID, CategoryID: listrik.ID, Date: "2026-11-05", Type: "pengeluaran", Amount: 250000, Description: "Token listrik", PartnerName: "PLN", RefNo: "K-1"},
		models.Transaction{OrganizationID: 1, BookID: bookB.ID, CategoryID: donasi.ID, Date: "2026-11-09", Type: "pemasukan", Amount: 5000000, Description: "Donasi kubah"},
	)
	if err := db.CreateInBatches(&rows, 200).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	open := func(file *ExportFile) *excelize.File {
		t.Helper()
		f, err := excelize.OpenReader(bytes.NewReader(file.Data))
		if err != nil {
			t.Fatalf("open xlsx: %v", err)
		}
		return f
	}
	calc := func(f *excelize.File, sheet, cell string) string {
		t.Helper()
		v, err := f.CalcCellValue(sheet, cell, excelize.Options{RawCellValue: true})
		if err != nil {
			t.Fatalf("calc %s!%s: %v", sheet, cell, err)
		}
		return v
	}

	masjid := &models.MasjidSettings{Name: "Masjid An-Nur", ReportFooter: "Jazakumullah khairan"}
	file, err := txs.ExportTransactions(all, ExportTransactionsInput{}, masjid)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if file.Rows != n+2 {
		t.Fatalf("exported %d rows, want %d", file.Rows, n+2)
	}
	if out := os.Getenv("EXPORT_SAMPLE"); out != "" {
		_ = os.WriteFile(out, file.Data, 0o644)
	}
	f := open(file)
	totalRow := xlHeaderRow + n + 2 + 1
	if got := calc(f, "Transaksi", cellRef(9, totalRow)); got != "6200000" {
		t.Fatalf("total pemasukan = %s, want 6200000", got)
	}
	if got := calc(f, "Transaksi", cellRef(10, totalRow)); got != "250000" {
		t.Fatalf("total pengeluaran = %s, want 250000", got)
	}
	if got := calc(f, "Transaksi", cellRef(9, totalRow+1)); got != "5950000" {
		t.Fatalf("selisih = %s, want 5950000", got)
	}
	if v, _ := f.GetCellValue("Transaksi", "A1"); v != "Masjid An-Nur" {
		t.Fatalf("A1 = %q", v)
	}
	// Oldest first; the last data row is the newest transaction.
	if v, _ := f.GetCellValue("Transaksi", cellRef(6, totalRow-1)); v != "Donasi kubah" {
		t.Fatalf("last row description = %q", v)
	}
	if v, _ := f.GetCellValue("Transaksi", cellRef(2, totalRow-1)); v != "09/11/2026" {
		t.Fatalf("last row date = %q, want 09/11/2026", v)
	}
	if v, _ := f.GetCellValue("Ringkasan", "B6"); v != "Donasi" {
		t.Fatalf("top income category = %q, want Donasi", v)
	}

	// Filters and the book lock.
	file, err = txs.ExportTransactions(all, ExportTransactionsInput{BookID: bookA.ID, Type: "pengeluaran", From: "2026-11-01", To: "2026-11-30"}, nil)
	if err != nil || file.Rows != 1 {
		t.Fatalf("filtered export rows = %v, err %v", file, err)
	}
	locked := repository.Scope{OrgID: 1, BookIDs: []uint{bookA.ID}}
	file, err = txs.ExportTransactions(locked, ExportTransactionsInput{}, nil)
	if err != nil || file.Rows != n+1 {
		t.Fatalf("locked export rows = %d, err %v; want %d", file.Rows, err, n+1)
	}
	if file, _ := txs.ExportTransactions(locked, ExportTransactionsInput{BookID: bookB.ID}, nil); file.Rows != 0 {
		t.Fatalf("locked user exported %d rows of another book", file.Rows)
	}
	if _, err := txs.ExportTransactions(all, ExportTransactionsInput{Type: "x"}, nil); !errors.Is(err, ErrInvalidType) {
		t.Fatalf("invalid type err = %v", err)
	}
	if _, err := txs.ExportTransactions(all, ExportTransactionsInput{From: "1 Nov"}, nil); !errors.Is(err, ErrInvalidDate) {
		t.Fatalf("invalid date err = %v", err)
	}
}
