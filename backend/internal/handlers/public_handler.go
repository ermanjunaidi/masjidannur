package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"backend/internal/models"
	"backend/internal/service"
)

// PublicDisplayHandler serves public display data for TV screens.
type PublicDisplayHandler struct {
	settingsService    *service.MasjidSettingsService
	transactionService *service.TransactionService
	lecturingService   *service.LecturingService
	bookService        *service.BookService
}

// NewPublicDisplayHandler creates a new PublicDisplayHandler.
func NewPublicDisplayHandler(
	settingsService *service.MasjidSettingsService,
	transactionService *service.TransactionService,
	lecturingService *service.LecturingService,
	bookService *service.BookService,
) *PublicDisplayHandler {
	return &PublicDisplayHandler{
		settingsService:    settingsService,
		transactionService: transactionService,
		lecturingService:   lecturingService,
		bookService:        bookService,
	}
}

// GetDisplayData handles GET /api/public/display and GET /api/public/display/:slug
func (h *PublicDisplayHandler) GetDisplayData(c *fiber.Ctx) error {
	slug := c.Params("slug")
	if slug == "" {
		slug = c.Query("slug")
	}

	var settings *models.MasjidSettings
	var err error

	if slug != "" && slug != "default" {
		settings, err = h.settingsService.GetBySlug(slug)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	if settings == nil {
		settings, err = h.settingsService.GetFirst()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}

	orgID := settings.OrganizationID
	today := time.Now().Format("2006-01-02")
	currentMonth := time.Now().Format("2006-01")

	// Get financial summary for current month across all books for this masjid
	monthly, err := h.transactionService.MonthlyReport(orgID, 0, 0, currentMonth)
	if err != nil {
		monthly = &service.MonthlyReport{
			Month: currentMonth,
			Totals: service.ReportTotals{
				Income:    0,
				Expense:   0,
				Net:       0,
				StartCash: 0,
				EndCash:   0,
			},
		}
	}

	// Fetch upcoming lecturings for this masjid (look ahead 30 days)
	futureDate := time.Now().AddDate(0, 1, 0).Format("2006-01-02")
	lecturings, err := h.lecturingService.ListLecturings(orgID, 0, "", today, futureDate)
	if err != nil {
		lecturings = nil
	}

	// Also fetch recent transactions (limit to 6)
	recentTxs, err := h.transactionService.ListTransactions(orgID, 0, 0, 0, "", "", "", "")
	if err != nil {
		recentTxs = nil
	}
	if len(recentTxs) > 6 {
		recentTxs = recentTxs[:6]
	}

	books, _ := h.bookService.ListBooks(orgID, 0)

	return c.JSON(fiber.Map{
		"masjid": settings,
		"finance": fiber.Map{
			"month":        currentMonth,
			"income":       monthly.Totals.Income,
			"expense":      monthly.Totals.Expense,
			"net":          monthly.Totals.Net,
			"start_cash":   monthly.Totals.StartCash,
			"current_cash": monthly.Totals.EndCash,
		},
		"lecturings":          lecturings,
		"recent_transactions": recentTxs,
		"books":               books,
		"server_time":         time.Now().Format(time.RFC3339),
	})
}
