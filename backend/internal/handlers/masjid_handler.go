package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
	"backend/pkg/middleware"
)

// ─── BookHandler ──────────────────────────────────────────────────────────────

// BookHandler exposes CRUD over cash books.
type BookHandler struct {
	bookService *service.BookService
}

// NewBookHandler wires the dependency.
func NewBookHandler(bookService *service.BookService) *BookHandler {
	return &BookHandler{bookService: bookService}
}

// ListBooks handles GET /api/books
func (h *BookHandler) ListBooks(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	books, err := h.bookService.ListBooks(orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"books": books})
}

// GetBook handles GET /api/books/:id
func (h *BookHandler) GetBook(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid book id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	book, err := h.bookService.GetBook(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if book == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrBookNotFound.Error()})
	}
	return c.JSON(book)
}

// CreateBook handles POST /api/books
func (h *BookHandler) CreateBook(c *fiber.Ctx) error {
	var input service.CreateBookInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	book, err := h.bookService.CreateBook(&input, orgID, branchID)
	if err != nil {
		if errors.Is(err, service.ErrMasjidNameRequired) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(book)
}

// UpdateBook handles PUT /api/books/:id
func (h *BookHandler) UpdateBook(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid book id"})
	}
	var input service.UpdateBookInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	book, err := h.bookService.UpdateBook(uint(id), orgID, branchID, &input)
	if err != nil {
		if errors.Is(err, service.ErrBookNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		if errors.Is(err, service.ErrMasjidNameRequired) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(book)
}

// DeleteBook handles DELETE /api/books/:id
func (h *BookHandler) DeleteBook(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid book id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	if err := h.bookService.DeleteBook(uint(id), orgID, branchID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// ─── CategoryHandler ──────────────────────────────────────────────────────────

// CategoryHandler exposes CRUD over categories.
type CategoryHandler struct {
	categoryService *service.CategoryService
}

// NewCategoryHandler wires the dependency.
func NewCategoryHandler(categoryService *service.CategoryService) *CategoryHandler {
	return &CategoryHandler{categoryService: categoryService}
}

// ListCategories handles GET /api/categories?book_id=&group=
func (h *CategoryHandler) ListCategories(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	bookID := parseUintQuery(c, "book_id")
	group := c.Query("group")
	cats, err := h.categoryService.ListCategories(orgID, branchID, bookID, group)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"categories": cats})
}

// CreateCategory handles POST /api/categories
func (h *CategoryHandler) CreateCategory(c *fiber.Ctx) error {
	var input service.CreateCategoryInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	cat, err := h.categoryService.CreateCategory(&input, orgID, branchID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMasjidNameRequired):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrInvalidGroup),
			errors.Is(err, service.ErrBookNotFound):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrCategoryTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(cat)
}

// UpdateCategory handles PUT /api/categories/:id
func (h *CategoryHandler) UpdateCategory(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category id"})
	}
	var input service.UpdateCategoryInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	cat, err := h.categoryService.UpdateCategory(uint(id), orgID, branchID, &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrCategoryNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrInvalidGroup),
			errors.Is(err, service.ErrMasjidNameRequired):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(cat)
}

// DeleteCategory handles DELETE /api/categories/:id
func (h *CategoryHandler) DeleteCategory(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	if err := h.categoryService.DeleteCategory(uint(id), orgID, branchID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// ─── TransactionHandler ───────────────────────────────────────────────────────

// TransactionHandler exposes CRUD over transactions + reports.
type TransactionHandler struct {
	txService *service.TransactionService
}

// NewTransactionHandler wires the dependency.
func NewTransactionHandler(txService *service.TransactionService) *TransactionHandler {
	return &TransactionHandler{txService: txService}
}

// ListTransactions handles GET /api/transactions with optional filters:
// book_id, category_id, type, from, to, q.
func (h *TransactionHandler) ListTransactions(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	bookID := parseUintQuery(c, "book_id")
	categoryID := parseUintQuery(c, "category_id")
	txs, err := h.txService.ListTransactions(
		orgID, branchID, bookID, categoryID,
		c.Query("type"), c.Query("from"), c.Query("to"), c.Query("q"),
	)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"transactions": txs})
}

// CreateTransaction handles POST /api/transactions
func (h *TransactionHandler) CreateTransaction(c *fiber.Ctx) error {
	var input service.CreateTransactionInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	userID, _ := middleware.ActorUserID(c)
	tx, err := h.txService.CreateTransaction(&input, orgID, branchID, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMasjidNameRequired),
			errors.Is(err, service.ErrInvalidType),
			errors.Is(err, service.ErrInvalidAmount),
			errors.Is(err, service.ErrInvalidDate),
			errors.Is(err, service.ErrBookNotFound),
			errors.Is(err, service.ErrCategoryNotFound),
			errors.Is(err, service.ErrCategoryMismatch),
			errors.Is(err, service.ErrCategoryBookMismatch):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(tx)
}

// UpdateTransaction handles PUT /api/transactions/:id
func (h *TransactionHandler) UpdateTransaction(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid transaction id"})
	}
	var input service.UpdateTransactionInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	tx, err := h.txService.UpdateTransaction(uint(id), orgID, branchID, &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransactionNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrInvalidType),
			errors.Is(err, service.ErrInvalidAmount),
			errors.Is(err, service.ErrInvalidDate),
			errors.Is(err, service.ErrCategoryNotFound),
			errors.Is(err, service.ErrCategoryMismatch),
			errors.Is(err, service.ErrCategoryBookMismatch):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(tx)
}

// DeleteTransaction handles DELETE /api/transactions/:id
func (h *TransactionHandler) DeleteTransaction(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid transaction id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	if err := h.txService.DeleteTransaction(uint(id), orgID, branchID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// MonthlyReport handles GET /api/reports/monthly?month=YYYY-MM&book_id=
func (h *TransactionHandler) MonthlyReport(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	bookID := parseUintQuery(c, "book_id")
	report, err := h.txService.MonthlyReport(orgID, branchID, bookID, c.Query("month"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(report)
}

// CategoryReport handles GET /api/reports/category?from=&to=&book_id=
func (h *TransactionHandler) CategoryReport(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	bookID := parseUintQuery(c, "book_id")
	totals, rows, err := h.txService.CategoryReport(orgID, branchID, bookID, c.Query("from"), c.Query("to"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"totals": totals, "rows": rows})
}

// WeeklyReport handles GET /api/reports/weekly?from=&to=&book_id=
func (h *TransactionHandler) WeeklyReport(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	bookID := parseUintQuery(c, "book_id")
	report, err := h.txService.WeeklyReport(orgID, branchID, bookID, c.Query("from"), c.Query("to"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(report)
}

// ─── MasjidSettingsHandler ───────────────────────────────────────────────────

// MasjidSettingsHandler exposes the masjid profile endpoints.
type MasjidSettingsHandler struct {
	settingsService *service.MasjidSettingsService
}

// NewMasjidSettingsHandler wires the dependency.
func NewMasjidSettingsHandler(settingsService *service.MasjidSettingsService) *MasjidSettingsHandler {
	return &MasjidSettingsHandler{settingsService: settingsService}
}

// GetSettings handles GET /api/masjid-settings
func (h *MasjidSettingsHandler) GetSettings(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	sr, err := h.settingsService.GetSettings(orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(sr)
}

// UpdateSettings handles PUT /api/masjid-settings
func (h *MasjidSettingsHandler) UpdateSettings(c *fiber.Ctx) error {
	var input service.UpdateSettingsInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	userID, _ := middleware.ActorUserID(c)
	sr, err := h.settingsService.UpdateSettings(orgID, &input, userID)
	if err != nil {
		if errors.Is(err, service.ErrMasjidNameRequired) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(sr)
}

// parseUintQuery parses an unsigned query param; returns 0 when absent
// or malformed (filters are all optional).
func parseUintQuery(c *fiber.Ctx, key string) uint {
	v := c.Query(key)
	if v == "" {
		return 0
	}
	n, err := strconv.ParseUint(v, 10, 64)
	if err != nil {
		return 0
	}
	return uint(n)
}
