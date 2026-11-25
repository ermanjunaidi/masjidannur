package handlers

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/middleware"
)

func TestAuditMiddleware(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Role{}, &models.Permission{}, &models.AuditLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	user := models.User{Name: "Pak Bendahara", Email: "bendahara@masjid.id", Password: "x", OrganizationID: 7}
	db.Create(&user)
	repo := repository.NewAuditRepository(db)
	h := NewAuditHandler(repo)

	app := fiber.New()
	app.Use(h.Middleware())
	// Stand-in for RequireAuth: the X-User header says who is calling.
	auth := func(c *fiber.Ctx) error {
		if c.Get("X-User") == "" {
			return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
		}
		c.Locals(middleware.CtxUserID, user.ID)
		c.Locals(middleware.CtxOrganizationID, user.OrganizationID)
		return c.Next()
	}
	app.Post("/api/auth/login", func(c *fiber.Ctx) error {
		if strings.Contains(string(c.Body()), "benar") {
			return c.JSON(fiber.Map{"token": "t"})
		}
		return c.Status(401).JSON(fiber.Map{"error": "salah"})
	})
	api := app.Group("/api", auth)
	api.Get("/transactions", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{}) })
	api.Get("/transactions/export", func(c *fiber.Ctx) error { return c.SendString("xlsx") })
	api.Post("/transactions", func(c *fiber.Ctx) error {
		if strings.Contains(string(c.Body()), `"amount":0`) {
			return c.Status(400).JSON(fiber.Map{"error": "jumlah"})
		}
		return c.Status(201).JSON(fiber.Map{"id": 42})
	})
	api.Put("/users/:id", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"id": 9}) })
	api.Delete("/books/:id", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"deleted": 3}) })
	api.Post("/residents/import", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"created": 2}) })
	api.Get("/audit-logs", h.List)

	do := func(method, path, body string, authed bool) int {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if authed {
			req.Header.Set("X-User", "1")
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		return resp.StatusCode
	}

	do("GET", "/api/transactions", "", true)                                        // read: not logged
	do("POST", "/api/transactions", `{"amount":0}`, true)                           // failed change: not logged
	do("POST", "/api/transactions", `{"amount":5000,"description":"Infaq"}`, false) // unauthenticated: not logged
	do("POST", "/api/transactions", `{"amount":5000,"description":"Infaq"}`, true)
	do("PUT", "/api/users/9", `{"name":"Budi","password":"rahasia123","nested":{"api_token":"abc"}}`, true)
	do("DELETE", "/api/books/3", "", true)
	do("POST", "/api/residents/import", "", true)
	do("GET", "/api/transactions/export?book_id=2", "", true)
	do("POST", "/api/auth/login", `{"email":"Bendahara@masjid.id","password":"benar"}`, false)
	do("POST", "/api/auth/login", `{"email":"bendahara@masjid.id","password":"keliru"}`, false)

	var logs []models.AuditLog
	db.Order("id ASC").Find(&logs)
	type want struct {
		action, resource string
		id               uint
	}
	wants := []want{
		{"create", "transactions", 42}, {"update", "users", 9}, {"delete", "books", 3},
		{"import", "residents", 0}, {"export", "transactions", 0}, {"login", "auth", 0}, {"login_failed", "auth", 0},
	}
	if len(logs) != len(wants) {
		t.Fatalf("logged %d entries, want %d: %+v", len(logs), len(wants), logs)
	}
	for i, w := range wants {
		l := logs[i]
		if l.Action != w.action || l.Resource != w.resource || l.ResourceID != w.id {
			t.Errorf("entry %d = %s %s #%d, want %+v", i, l.Action, l.Resource, l.ResourceID, w)
		}
		if l.UserID != user.ID || l.OrganizationID != 7 || l.UserName != "Pak Bendahara" {
			t.Errorf("entry %d actor = %d org %d %q", i, l.UserID, l.OrganizationID, l.UserName)
		}
	}
	if d := logs[0].Detail; !strings.Contains(d, `"description":"Infaq"`) {
		t.Errorf("create detail = %s", d)
	}
	// Secrets never reach the log.
	for _, l := range logs {
		if strings.Contains(l.Detail, "rahasia123") || strings.Contains(l.Detail, "abc") ||
			strings.Contains(l.Detail, "benar") || strings.Contains(l.Detail, "keliru") {
			t.Errorf("secret leaked into audit detail: %s", l.Detail)
		}
	}
	if d := logs[4].Detail; d != "book_id=2" {
		t.Errorf("export detail = %q", d)
	}

	// Listing is scoped to the caller's organization and filterable.
	db.Create(&models.AuditLog{OrganizationID: 8, Action: "create", Resource: "books", UserName: "Masjid lain"})
	req := httptest.NewRequest("GET", "/api/audit-logs?resource=auth&page_size=1", nil)
	req.Header.Set("X-User", "1")
	resp, _ := app.Test(req)
	raw, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(raw), `"total":2`) || strings.Contains(string(raw), "Masjid lain") ||
		!strings.Contains(string(raw), `"action":"login_failed"`) {
		t.Fatalf("list = %s", raw)
	}
	if list, total, _ := repo.List(7, repository.AuditFilter{Page: 1, PageSize: 50}); total != 7 || len(list) != 7 {
		t.Fatalf("org 7 sees %d/%d entries, want 7", len(list), total)
	}
	if _, total, _ := repo.List(0, repository.AuditFilter{Page: 1, PageSize: 50, Search: "infaq"}); total != 1 {
		t.Fatalf("search infaq total = %d, want 1", total)
	}
}
