package service

import (
	"errors"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// "Pembagian ke warga" belongs to PHBI books: each row is a pengeluaran with
// the resident's name and RT/RW, and the book keeps its own summary.
func TestPHBIDistributions(t *testing.T) {
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
	sc := repository.Scope{OrgID: 1}

	plain, _ := books.CreateBook(&CreateBookInput{Name: "Operasional"}, sc)
	phbi, _ := books.CreateBook(&CreateBookInput{Name: "Maulid Nabi 1448", IsPHBI: true}, sc)
	if !phbi.IsPHBI || plain.IsPHBI {
		t.Fatalf("is_phbi flags wrong: %+v %+v", phbi, plain)
	}
	income, _ := cats.CreateCategory(&CreateCategoryInput{BookID: phbi.ID, Name: "Donasi", Group: "pendapatan"}, sc)

	// Only PHBI books have a resident distribution list.
	if _, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: plain.ID, Distribution: true, PartnerName: "Pak Budi", Amount: 1000,
	}, sc, 1); !errors.Is(err, ErrNotPHBIBook) {
		t.Fatalf("distribution in plain book err = %v, want ErrNotPHBIBook", err)
	}
	// Every distribution needs a resident name and a positive amount.
	if _, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: phbi.ID, Distribution: true, PartnerName: "  ", Amount: 1000,
	}, sc, 1); !errors.Is(err, ErrRecipientRequired) {
		t.Fatalf("nameless distribution err = %v, want ErrRecipientRequired", err)
	}
	if _, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: phbi.ID, Distribution: true, PartnerName: "Bu Siti", Amount: 0,
	}, sc, 1); !errors.Is(err, ErrInvalidAmount) {
		t.Fatalf("empty distribution err = %v, want ErrInvalidAmount", err)
	}
	ordinary, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: phbi.ID, CategoryID: income.ID, Type: "pemasukan", Amount: 500000,
	}, sc, 1)
	if err != nil {
		t.Fatalf("income: %v", err)
	}

	siti, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: phbi.ID, Distribution: true, PartnerName: "Bu Siti", RT: "02", RW: "05", Amount: 50000,
	}, sc, 1)
	if err != nil {
		t.Fatalf("distribution: %v", err)
	}
	if siti.Type != "pengeluaran" || !siti.IsDistribution || siti.RT != "02" || siti.RW != "05" {
		t.Fatalf("distribution row = %+v", siti)
	}
	if _, err = txs.CreateTransaction(&CreateTransactionInput{
		BookID: phbi.ID, Distribution: true, PartnerName: "Pak Ahmad", RT: "01", RW: "05", Amount: 25000,
	}, sc, 1); err != nil {
		t.Fatalf("second distribution: %v", err)
	}
	// Both rows share one auto-created category.
	if list, _ := cats.ListCategories(sc, phbi.ID, "pengeluaran"); len(list) != 1 || list[0].Name != DistributionCategoryName {
		t.Fatalf("distribution categories = %+v", list)
	}

	// Edit the resident's name and RT; type/category stay fixed.
	name, rt, wrongType, wrongCategory := "Ibu Siti Aminah", "03", "pemasukan", income.ID
	edited, err := txs.UpdateTransaction(siti.ID, sc, &UpdateTransactionInput{
		PartnerName: &name, RT: &rt, Type: &wrongType, CategoryID: &wrongCategory,
	})
	if err != nil || edited.PartnerName != name || edited.RT != "03" || edited.RW != "05" ||
		edited.Type != "pengeluaran" || edited.CategoryID == income.ID {
		t.Fatalf("edit = %+v, err %v", edited, err)
	}
	blank := " "
	if _, err := txs.UpdateTransaction(siti.ID, sc, &UpdateTransactionInput{PartnerName: &blank}); !errors.Is(err, ErrRecipientRequired) {
		t.Fatalf("blank name err = %v, want ErrRecipientRequired", err)
	}
	zero := 0.0
	if _, err := txs.UpdateTransaction(siti.ID, sc, &UpdateTransactionInput{Amount: &zero}); !errors.Is(err, ErrInvalidAmount) {
		t.Fatalf("zero amount err = %v, want ErrInvalidAmount", err)
	}

	// The distributions endpoints only touch distribution rows.
	if _, err := txs.UpdateDistribution(ordinary.ID, sc, &UpdateTransactionInput{PartnerName: &name}); !errors.Is(err, ErrTransactionNotFound) {
		t.Fatalf("UpdateDistribution on an ordinary row err = %v, want ErrTransactionNotFound", err)
	}
	if err := txs.DeleteDistribution(ordinary.ID, sc); !errors.Is(err, ErrTransactionNotFound) {
		t.Fatalf("DeleteDistribution on an ordinary row err = %v, want ErrTransactionNotFound", err)
	}
	if pb, _ := txs.PHBIBooks(sc); len(pb) != 1 || pb[0].ID != phbi.ID {
		t.Fatalf("phbi books = %+v", pb)
	}

	list, err := txs.ListDistributions(sc, phbi.ID)
	if err != nil || len(list) != 2 || list[0].PartnerName != "Pak Ahmad" || list[1].PartnerName != name {
		t.Fatalf("distributions = %+v, err %v", list, err)
	}
	sum, err := txs.DistributionSummary(sc, phbi.ID)
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	want := DistributionSummary{
		BookID: phbi.ID, Income: 500000, Expense: 75000, Balance: 425000,
		Recipients: 2, DistributedAmount: 75000,
	}
	if *sum != want {
		t.Fatalf("summary = %+v, want %+v", *sum, want)
	}
	if _, err := txs.DistributionSummary(sc, plain.ID); !errors.Is(err, ErrNotPHBIBook) {
		t.Fatalf("summary of plain book err = %v, want ErrNotPHBIBook", err)
	}
	// A user locked to another book cannot see this one.
	locked := repository.Scope{OrgID: 1, BookIDs: []uint{plain.ID}}
	if _, err := txs.DistributionSummary(locked, phbi.ID); !errors.Is(err, ErrBookNotFound) {
		t.Fatalf("locked summary err = %v, want ErrBookNotFound", err)
	}
	if list, err := txs.ListTransactions(locked, phbi.ID, 0, "", "", "", ""); err != nil || len(list) != 0 {
		t.Fatalf("locked transactions = %+v, err %v", list, err)
	}
}
