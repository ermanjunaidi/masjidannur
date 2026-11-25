package service

import (
	"errors"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// A user locked to selected cash books must not reach any other book of
// the same organization through books, categories, transactions or reports.
func TestBookLock(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Role{}, &models.Permission{},
		&models.Book{}, &models.UserBook{}, &models.Category{}, &models.Transaction{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	bookRepo := repository.NewBookRepository(db)
	catRepo := repository.NewCategoryRepository(db)
	txRepo := repository.NewTransactionRepository(db)
	userRepo := repository.NewUserRepository(db)
	books := NewBookService(bookRepo)
	cats := NewCategoryService(catRepo, bookRepo)
	txs := NewTransactionService(txRepo, catRepo, bookRepo)

	all := repository.Scope{OrgID: 1}
	mk := func(name string, amount float64) (*models.Book, *models.Category, *models.Transaction) {
		b, err := books.CreateBook(&CreateBookInput{Name: name}, all)
		if err != nil {
			t.Fatalf("create book: %v", err)
		}
		c, err := cats.CreateCategory(&CreateCategoryInput{BookID: b.ID, Name: "Infaq", Group: "pendapatan"}, all)
		if err != nil {
			t.Fatalf("create category: %v", err)
		}
		tx, err := txs.CreateTransaction(&CreateTransactionInput{
			BookID: b.ID, CategoryID: c.ID, Date: "2026-11-10", Type: "pemasukan", Amount: amount,
		}, all, 1)
		if err != nil {
			t.Fatalf("create tx: %v", err)
		}
		return b, c, tx
	}
	bookA, _, _ := mk("Operasional", 100)
	bookB, catB, txB := mk("Pembangunan", 900)

	locked := repository.Scope{OrgID: 1, BookIDs: []uint{bookA.ID}}

	if list, _ := books.ListBooks(locked); len(list) != 1 || list[0].ID != bookA.ID {
		t.Fatalf("locked user sees books %+v, want only %d", list, bookA.ID)
	}
	if b, _ := books.GetBook(bookB.ID, locked); b != nil {
		t.Fatal("locked user can read a book outside the lock")
	}
	if _, err := books.CreateBook(&CreateBookInput{Name: "Baru"}, locked); !errors.Is(err, ErrBookLocked) {
		t.Fatalf("create book err = %v, want ErrBookLocked", err)
	}
	if list, _ := cats.ListCategories(locked, 0, ""); len(list) != 1 || list[0].BookID != bookA.ID {
		t.Fatalf("locked user sees categories %+v", list)
	}
	if list, _ := cats.ListCategories(locked, bookB.ID, ""); len(list) != 0 {
		t.Fatal("book_id filter bypasses the lock for categories")
	}
	name := "x"
	if _, err := cats.UpdateCategory(catB.ID, locked, &UpdateCategoryInput{Name: &name}); !errors.Is(err, ErrCategoryNotFound) {
		t.Fatalf("update category err = %v, want ErrCategoryNotFound", err)
	}
	if list, _ := txs.ListTransactions(locked, 0, 0, "", "", "", ""); len(list) != 1 || list[0].BookID != bookA.ID {
		t.Fatalf("locked user sees transactions %+v", list)
	}
	if list, _ := txs.ListTransactions(locked, bookB.ID, 0, "", "", "", ""); len(list) != 0 {
		t.Fatal("book_id filter bypasses the lock for transactions")
	}
	if _, err := txs.CreateTransaction(&CreateTransactionInput{
		BookID: bookB.ID, CategoryID: catB.ID, Date: "2026-11-11", Type: "pemasukan", Amount: 1,
	}, locked, 2); !errors.Is(err, ErrBookNotFound) {
		t.Fatalf("create tx err = %v, want ErrBookNotFound", err)
	}
	amount := 1.0
	if _, err := txs.UpdateTransaction(txB.ID, locked, &UpdateTransactionInput{Amount: &amount}); !errors.Is(err, ErrTransactionNotFound) {
		t.Fatalf("update tx err = %v, want ErrTransactionNotFound", err)
	}
	if err := txs.DeleteTransaction(txB.ID, locked); err != nil {
		t.Fatalf("delete tx: %v", err)
	}
	if tx, _ := txRepo.FindByID(txB.ID, all); tx == nil {
		t.Fatal("locked user deleted a transaction outside the lock")
	}

	// Reports over "all books" only add up the locked books.
	monthly, err := txs.MonthlyReport(locked, 0, "2026-11")
	if err != nil || monthly.Totals.Income != 100 {
		t.Fatalf("monthly income = %+v (err %v), want 100", monthly, err)
	}
	if m, _ := txs.MonthlyReport(locked, bookB.ID, "2026-11"); m.Totals.Income != 0 || len(m.Rows) != 0 {
		t.Fatalf("monthly report leaks book B: %+v", m)
	}
	if totals, _, _ := txs.CategoryReport(locked, 0, "2026-11-01", "2026-11-30"); totals.Income != 100 {
		t.Fatalf("category report income = %v, want 100", totals.Income)
	}
	if w, _ := txs.WeeklyReport(locked, 0, "2026-11-01", "2026-11-30"); w.Totals.Income != 100 {
		t.Fatalf("weekly report income = %v, want 100", w.Totals.Income)
	}
	period, err := txs.PeriodReport(locked, "2026-11-01", "2026-11-30")
	if err != nil || len(period.Books) != 1 || period.Totals.Income != 100 {
		t.Fatalf("period report = %+v (err %v)", period, err)
	}

	// Assigning the lock: only books of the user's own organization, and a
	// locked admin cannot hand out more than their own books.
	users := NewUserService(userRepo, repository.NewRoleRepository(db), bookRepo, nil)
	admin := &models.User{Name: "Admin", Email: "admin@x.id", Password: "x", OrganizationID: 1}
	lockedAdmin := &models.User{Name: "Locked", Email: "locked@x.id", Password: "x", OrganizationID: 1}
	if err := userRepo.CreateWithRoles(admin, nil, nil); err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := userRepo.CreateWithRoles(lockedAdmin, nil, []uint{bookA.ID}); err != nil {
		t.Fatalf("create locked admin: %v", err)
	}
	if ids, _ := userRepo.BookIDs(lockedAdmin.ID); len(ids) != 1 || ids[0] != bookA.ID {
		t.Fatalf("stored lock = %v", ids)
	}
	other, _ := books.CreateBook(&CreateBookInput{Name: "Masjid lain"}, repository.Scope{OrgID: 2})

	a := Actor{ID: admin.ID, OrgID: 1}
	if ids, err := users.resolveBookLock(a, 1, []uint{bookB.ID, bookB.ID}, true); err != nil || len(ids) != 1 {
		t.Fatalf("admin lock = %v, %v", ids, err)
	}
	if _, err := users.resolveBookLock(a, 1, []uint{other.ID}, true); !errors.Is(err, ErrBookLockInvalid) {
		t.Fatalf("foreign book err = %v, want ErrBookLockInvalid", err)
	}
	la := Actor{ID: lockedAdmin.ID, OrgID: 1}
	if _, err := users.resolveBookLock(la, 1, []uint{bookB.ID}, true); !errors.Is(err, ErrBookLockEscalation) {
		t.Fatalf("escalation err = %v, want ErrBookLockEscalation", err)
	}
	if _, err := users.resolveBookLock(la, 1, nil, false); !errors.Is(err, ErrBookLockEscalation) {
		t.Fatalf("unlock by locked admin err = %v, want ErrBookLockEscalation", err)
	}
	if ids, err := users.resolveBookLock(la, 1, nil, true); err != nil || len(ids) != 1 || ids[0] != bookA.ID {
		t.Fatalf("inherited lock = %v, %v", ids, err)
	}
}
