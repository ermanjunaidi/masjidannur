package handlers

import (
	"errors"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
	"backend/internal/service"
	"backend/pkg/middleware"
)

// A "pembagian ke warga" row has its own distributions permissions. The
// generic transaction endpoints must not let transactions:write/delete
// create, edit, or delete such a row, and editing one through the ledger
// must not change its type or category.
func TestTransactionEndpointsRequireDistributionPermissions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Role{}, &models.Permission{},
		&models.Book{}, &models.Category{}, &models.Transaction{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	txs := service.NewTransactionService(
		repository.NewTransactionRepository(db),
		repository.NewCategoryRepository(db),
		repository.NewBookRepository(db),
	)

	ram := models.Book{OrganizationID: 7, Name: "Maulid Nabi 1448", IsActive: true, IsPHBI: true}
	if err := db.Create(&ram).Error; err != nil {
		t.Fatalf("create book: %v", err)
	}
	incomeCat := models.Category{OrganizationID: 7, BookID: ram.ID, Name: "Zakat Fitrah", Group: "pendapatan"}
	distCat := models.Category{OrganizationID: 7, BookID: ram.ID, Name: service.DistributionCategoryName, Group: "pengeluaran"}
	if err := db.Create(&incomeCat).Error; err != nil {
		t.Fatalf("create income category: %v", err)
	}
	if err := db.Create(&distCat).Error; err != nil {
		t.Fatalf("create distribution category: %v", err)
	}
	dist := models.Transaction{
		OrganizationID: 7, BookID: ram.ID, CategoryID: distCat.ID, IsDistribution: true,
		Type: "pengeluaran", Date: "2026-03-01", Amount: 1000, PartnerName: "Bu Siti",
	}
	ordinary := models.Transaction{
		OrganizationID: 7, BookID: ram.ID, CategoryID: incomeCat.ID,
		Type: "pemasukan", Date: "2026-03-02", Amount: 500,
	}
	if err := db.Create(&dist).Error; err != nil {
		t.Fatalf("create distribution: %v", err)
	}
	if err := db.Create(&ordinary).Error; err != nil {
		t.Fatalf("create transaction: %v", err)
	}

	app := fiber.New()
	// Stand-in for RequireAuth + the JWT permission claims.
	app.Use(func(c *fiber.Ctx) error {
		c.Locals(middleware.CtxUserID, uint(1))
		c.Locals(middleware.CtxOrganizationID, uint(7))
		var perms []string
		if raw := c.Get("X-Perms"); raw != "" {
			perms = strings.Split(raw, ",")
		}
		c.Locals(middleware.CtxPermissions, perms)
		return c.Next()
	})
	h := NewTransactionHandler(txs, nil)
	app.Post("/transactions", h.CreateTransaction)
	app.Put("/transactions/:id", h.UpdateTransaction)
	app.Delete("/transactions/:id", h.DeleteTransaction)

	do := func(method, path, body, perms string) int {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		req.Header.Set("X-Perms", perms)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		return resp.StatusCode
	}

	distPath := "/transactions/" + strconv.FormatUint(uint64(dist.ID), 10)
	ordinaryPath := "/transactions/" + strconv.FormatUint(uint64(ordinary.ID), 10)
	distBody := `{"book_id":` + strconv.FormatUint(uint64(ram.ID), 10) +
		`,"distribution":true,"partner_name":"Pak Ahmad","amount":1000}`

	// Creating a distribution through the ledger needs distributions:write.
	if got := do("POST", "/transactions", distBody, "transactions:write"); got != fiber.StatusForbidden {
		t.Errorf("create distribution with transactions:write = %d, want 403", got)
	}
	if got := do("POST", "/transactions", distBody, "transactions:write,distributions:write"); got != fiber.StatusCreated {
		t.Errorf("create distribution with distributions:write = %d, want 201", got)
	}
	// An ordinary transaction still works with transactions:write alone.
	if got := do("POST", "/transactions",
		`{"book_id":`+strconv.FormatUint(uint64(ram.ID), 10)+`,"category_id":`+
			strconv.FormatUint(uint64(incomeCat.ID), 10)+`,"type":"pemasukan","amount":500}`,
		"transactions:write"); got != fiber.StatusCreated {
		t.Errorf("create ordinary transaction = %d, want 201", got)
	}

	// Editing a distribution through the ledger needs distributions:write.
	editBody := `{"amount":2000,"type":"pemasukan","category_id":` +
		strconv.FormatUint(uint64(incomeCat.ID), 10) + `}`
	if got := do("PUT", distPath, editBody, "transactions:write"); got != fiber.StatusForbidden {
		t.Errorf("update distribution with transactions:write = %d, want 403", got)
	}
	if got := do("PUT", distPath, editBody, "transactions:write,distributions:write"); got != fiber.StatusOK {
		t.Errorf("update distribution with distributions:write = %d, want 200", got)
	}
	var reloaded models.Transaction
	if err := db.First(&reloaded, dist.ID).Error; err != nil {
		t.Fatalf("reload distribution: %v", err)
	}
	if reloaded.Amount != 2000 {
		t.Errorf("distribution amount = %v, want 2000", reloaded.Amount)
	}
	// Its type and category stay fixed.
	if reloaded.Type != "pengeluaran" || reloaded.CategoryID != distCat.ID {
		t.Errorf("distribution type/category = %s/%d, want pengeluaran/%d",
			reloaded.Type, reloaded.CategoryID, distCat.ID)
	}

	// Deleting a distribution through the ledger needs distributions:delete.
	if got := do("DELETE", distPath, "", "transactions:delete"); got != fiber.StatusForbidden {
		t.Errorf("delete distribution with transactions:delete = %d, want 403", got)
	}
	var alive models.Transaction
	if err := db.First(&alive, dist.ID).Error; err != nil {
		t.Fatalf("distribution should still exist: %v", err)
	}
	// Ordinary deletes are unchanged.
	if got := do("DELETE", ordinaryPath, "", "transactions:delete"); got != fiber.StatusOK {
		t.Errorf("delete ordinary transaction = %d, want 200", got)
	}
	if got := do("DELETE", distPath, "", "transactions:delete,distributions:delete"); got != fiber.StatusOK {
		t.Errorf("delete distribution with distributions:delete = %d, want 200", got)
	}
	if err := db.First(&models.Transaction{}, dist.ID).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("distribution lookup after delete err = %v, want not found", err)
	}
}
