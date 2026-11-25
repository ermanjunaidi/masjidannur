package service

import (
	"errors"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// A PHBI book keeps its event's data alone and can be closed by handing the
// remaining balance to the bendahara: one pengeluaran in the PHBI book, one
// pemasukan in the destination book, plus its own settlement record.
func TestPHBISettlement(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Role{}, &models.Permission{},
		&models.Book{}, &models.Category{}, &models.Transaction{},
		&models.BookSettlement{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	bookRepo := repository.NewBookRepository(db)
	catRepo := repository.NewCategoryRepository(db)
	txRepo := repository.NewTransactionRepository(db)
	books := NewBookService(bookRepo)
	cats := NewCategoryService(catRepo, bookRepo)
	txs := NewTransactionService(txRepo, catRepo, bookRepo)
	settlements := NewSettlementService(repository.NewBookSettlementRepository(db), bookRepo, catRepo, txRepo)
	sc := repository.Scope{OrgID: 1}

	plain, _ := books.CreateBook(&CreateBookInput{Name: "Kas Umum"}, sc)
	phbi, _ := books.CreateBook(&CreateBookInput{Name: "Maulid Nabi 1448", IsPHBI: true}, sc)
	if !phbi.IsPHBI || plain.IsPHBI {
		t.Fatalf("is_phbi flags wrong: %+v %+v", phbi, plain)
	}

	income, _ := cats.CreateCategory(&CreateCategoryInput{BookID: phbi.ID, Name: "Donasi", Group: "pendapatan"}, sc)
	spend, _ := cats.CreateCategory(&CreateCategoryInput{BookID: phbi.ID, Name: "Konsumsi", Group: "pengeluaran"}, sc)
	if _, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: phbi.ID, CategoryID: income.ID, Date: "2026-10-01", Type: "pemasukan", Amount: 1000000,
	}, sc, 1); err != nil {
		t.Fatalf("income: %v", err)
	}
	if _, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: phbi.ID, CategoryID: spend.ID, Date: "2026-10-02", Type: "pengeluaran", Amount: 300000,
	}, sc, 1); err != nil {
		t.Fatalf("expense: %v", err)
	}

	info, err := settlements.Info(phbi.ID, sc)
	if err != nil || info.Balance != 700000 || info.Settlement != nil || !info.IsPHBI {
		t.Fatalf("info = %+v, err %v", info, err)
	}
	if _, err := settlements.Create(plain.ID, sc, &CreateSettlementInput{}, 1); !errors.Is(err, ErrNotPHBIBook) {
		t.Fatalf("settle plain book err = %v, want ErrNotPHBIBook", err)
	}
	// A handover may not exceed what is left.
	if _, err := settlements.Create(phbi.ID, sc, &CreateSettlementInput{Amount: 800000}, 1); !errors.Is(err, ErrSettlementAmount) {
		t.Fatalf("oversized handover err = %v, want ErrSettlementAmount", err)
	}

	// Amount 0 = the whole remaining balance; the destination gets the
	// matching pemasukan.
	settlement, err := settlements.Create(phbi.ID, sc, &CreateSettlementInput{
		Date: "2026-10-03", DestinationBookID: plain.ID, HandedTo: "Pak Bendahara", Note: "Sisa panitia",
	}, 1)
	if err != nil {
		t.Fatalf("settle: %v", err)
	}
	if settlement.Amount != 700000 || settlement.ExpenseTransactionID == 0 ||
		settlement.IncomeTransactionID == 0 || settlement.DestinationBookID != plain.ID {
		t.Fatalf("settlement = %+v", settlement)
	}

	// The PHBI book is empty now, the destination holds the balance.
	after, _ := txs.MonthlyReport(sc, phbi.ID, "2026-10")
	if after.Totals.EndCash != 0 {
		t.Fatalf("phbi closing = %v, want 0", after.Totals.EndCash)
	}
	dest, _ := txs.MonthlyReport(sc, plain.ID, "2026-10")
	if dest.Totals.Income != 700000 || dest.Totals.EndCash != 700000 {
		t.Fatalf("destination report = %+v", dest.Totals)
	}

	// Only one handover per book, and its ledger rows are not editable.
	if _, err := settlements.Create(phbi.ID, sc, &CreateSettlementInput{}, 1); !errors.Is(err, ErrSettlementExists) {
		t.Fatalf("second settle err = %v, want ErrSettlementExists", err)
	}
	amount := 1.0
	if _, err := txs.UpdateTransaction(settlement.ExpenseTransactionID, sc, &UpdateTransactionInput{Amount: &amount}); !errors.Is(err, ErrSettlementTxLocked) {
		t.Fatalf("update settlement tx err = %v, want ErrSettlementTxLocked", err)
	}
	if err := txs.DeleteTransaction(settlement.IncomeTransactionID, sc); !errors.Is(err, ErrSettlementTxLocked) {
		t.Fatalf("delete settlement tx err = %v, want ErrSettlementTxLocked", err)
	}

	// Cancelling restores both books.
	if err := settlements.Delete(phbi.ID, sc); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	restored, _ := settlements.Info(phbi.ID, sc)
	if restored.Balance != 700000 || restored.Settlement != nil {
		t.Fatalf("restored info = %+v", restored)
	}
	destAfter, _ := txs.MonthlyReport(sc, plain.ID, "2026-10")
	if destAfter.Totals.Income != 0 || len(destAfter.Rows) != 0 {
		t.Fatalf("destination after cancel = %+v", destAfter.Totals)
	}
	if err := settlements.Delete(phbi.ID, sc); !errors.Is(err, ErrSettlementNotFound) {
		t.Fatalf("second cancel err = %v, want ErrSettlementNotFound", err)
	}

	// A user locked to another book cannot reach the PHBI book.
	locked := repository.Scope{OrgID: 1, BookIDs: []uint{plain.ID}}
	if _, err := settlements.Info(phbi.ID, locked); !errors.Is(err, ErrBookNotFound) {
		t.Fatalf("locked info err = %v, want ErrBookNotFound", err)
	}
}
