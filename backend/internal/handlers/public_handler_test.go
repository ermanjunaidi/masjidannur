package handlers

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
	"backend/internal/service"
)

func TestPublicDisplayHandler(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect sqlite: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Book{},
		&models.Category{},
		&models.Transaction{},
		&models.MasjidSettings{},
		&models.Lecturing{},
	); err != nil {
		t.Fatalf("failed to automigrate: %v", err)
	}

	// Seed settings
	settingsRepo := repository.NewMasjidSettingsRepository(db)
	_ = settingsRepo.Save(&models.MasjidSettings{
		ID:           1,
		Name:         "Masjid Al-Hikmah",
		Address:      "Jl. Merdeka No. 10",
		CurrencyCode: "Rp",
	})

	bookRepo := repository.NewBookRepository(db)
	catRepo := repository.NewCategoryRepository(db)
	txRepo := repository.NewTransactionRepository(db)
	lecRepo := repository.NewLecturingRepository(db)

	settingsService := service.NewMasjidSettingsService(settingsRepo)
	bookService := service.NewBookService(bookRepo)
	txService := service.NewTransactionService(txRepo, catRepo, bookRepo)
	lecService := service.NewLecturingService(lecRepo)

	handler := NewPublicDisplayHandler(settingsService, txService, lecService, bookService)

	app := fiber.New()
	app.Get("/api/public/display", handler.GetDisplayData)

	req := httptest.NewRequest("GET", "/api/public/display", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	masjidMap, ok := result["masjid"].(map[string]interface{})
	if !ok || masjidMap["name"] != "Masjid Al-Hikmah" {
		t.Fatalf("expected masjid name 'Masjid Al-Hikmah', got %v", result["masjid"])
	}

	if _, ok := result["finance"]; !ok {
		t.Fatalf("expected finance in response")
	}
}
