package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/repository"
	"backend/internal/service"
	"backend/pkg/middleware"
)

// scopeFrom builds the data scope of the current request: organization,
// branch, and the cash books the user is locked to (see middleware.BookScope).
func scopeFrom(c *fiber.Ctx) repository.Scope {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	return repository.Scope{OrgID: orgID, BranchID: branchID, BookIDs: middleware.ActorBookIDs(c)}
}

// ─── BookHandler ──────────────────────────────────────────────────────────────

// BookHandler exposes CRUD over cash books and the handover of a PHBI
// book's remaining balance to the bendahara.
type BookHandler struct {
	bookService       *service.BookService
	settlementService *service.SettlementService
}

// NewBookHandler wires the dependencies.
func NewBookHandler(bookService *service.BookService, settlementService *service.SettlementService) *BookHandler {
	return &BookHandler{bookService: bookService, settlementService: settlementService}
}

// ListBooks handles GET /api/books
func (h *BookHandler) ListBooks(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	books, err := h.bookService.ListBooks(sc)
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
	sc := scopeFrom(c)
	book, err := h.bookService.GetBook(uint(id), sc)
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
	sc := scopeFrom(c)
	book, err := h.bookService.CreateBook(&input, sc)
	if err != nil {
		if errors.Is(err, service.ErrMasjidNameRequired) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		if errors.Is(err, service.ErrBookLocked) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
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
	sc := scopeFrom(c)
	book, err := h.bookService.UpdateBook(uint(id), sc, &input)
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
	sc := scopeFrom(c)
	if err := h.bookService.DeleteBook(uint(id), sc); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// settlementError maps PHBI handover errors to HTTP status codes.
func settlementError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrBookNotFound), errors.Is(err, service.ErrSettlementNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrSettlementExists):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrNotPHBIBook), errors.Is(err, service.ErrSettlementAmount),
		errors.Is(err, service.ErrSettlementSameBook), errors.Is(err, service.ErrInvalidDate):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
}

// GetSettlement handles GET /api/books/:id/settlement — the PHBI book's
// remaining balance and its handover record (null when not closed).
func (h *BookHandler) GetSettlement(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid book id"})
	}
	info, err := h.settlementService.Info(uint(id), scopeFrom(c))
	if err != nil {
		return settlementError(c, err)
	}
	return c.JSON(info)
}

// CreateSettlement handles POST /api/books/:id/settlement — hand the PHBI
// book's remaining balance over to the bendahara.
func (h *BookHandler) CreateSettlement(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid book id"})
	}
	var input service.CreateSettlementInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	userID, _ := middleware.ActorUserID(c)
	settlement, err := h.settlementService.Create(uint(id), scopeFrom(c), &input, userID)
	if err != nil {
		return settlementError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(settlement)
}

// DeleteSettlement handles DELETE /api/books/:id/settlement — cancel the
// handover and remove the ledger entries it created.
func (h *BookHandler) DeleteSettlement(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid book id"})
	}
	if err := h.settlementService.Delete(uint(id), scopeFrom(c)); err != nil {
		return settlementError(c, err)
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
	sc := scopeFrom(c)
	bookID := parseUintQuery(c, "book_id")
	group := c.Query("group")
	cats, err := h.categoryService.ListCategories(sc, bookID, group)
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
	sc := scopeFrom(c)
	cat, err := h.categoryService.CreateCategory(&input, sc)
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
	sc := scopeFrom(c)
	cat, err := h.categoryService.UpdateCategory(uint(id), sc, &input)
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
	sc := scopeFrom(c)
	if err := h.categoryService.DeleteCategory(uint(id), sc); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// ─── TransactionHandler ───────────────────────────────────────────────────────

// TransactionHandler exposes CRUD over transactions + reports.
type TransactionHandler struct {
	txService       *service.TransactionService
	settingsService *service.MasjidSettingsService
}

// NewTransactionHandler wires the dependencies. settingsService supplies
// the masjid name and report footer for the Excel export.
func NewTransactionHandler(txService *service.TransactionService, settingsService *service.MasjidSettingsService) *TransactionHandler {
	return &TransactionHandler{txService: txService, settingsService: settingsService}
}

// ExportTransactions handles GET /api/transactions/export — an .xlsx of
// every transaction matching the filters (book_id, type, from, to, q),
// not capped like the list endpoint.
func (h *TransactionHandler) ExportTransactions(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	// The profile only decorates the header; export still works without it.
	masjid, _ := h.settingsService.GetSettings(sc.OrgID)
	file, err := h.txService.ExportTransactions(sc, service.ExportTransactionsInput{
		BookID: parseUintQuery(c, "book_id"),
		Type:   c.Query("type"),
		From:   c.Query("from"),
		To:     c.Query("to"),
		Search: c.Query("q"),
	}, masjid)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidType), errors.Is(err, service.ErrInvalidDate),
			errors.Is(err, service.ErrExportTooLarge):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	c.Set(fiber.HeaderContentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="`+file.Name+`"`)
	return c.Send(file.Data)
}

// ListTransactions handles GET /api/transactions with optional filters:
// book_id, category_id, type, from, to, q.
func (h *TransactionHandler) ListTransactions(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	bookID := parseUintQuery(c, "book_id")
	categoryID := parseUintQuery(c, "category_id")
	txs, err := h.txService.ListTransactions(
		sc, bookID, categoryID,
		c.Query("type"), c.Query("from"), c.Query("to"), c.Query("q"),
	)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"transactions": txs})
}

// ListDistributions handles GET /api/distributions?book_id= —
// the "pembagian ke warga" list of a PHBI book plus its summary.
func (h *TransactionHandler) ListDistributions(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	bookID := parseUintQuery(c, "book_id")
	summary, err := h.txService.DistributionSummary(sc, bookID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrBookNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrNotPHBIBook):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	rows, err := h.txService.ListDistributions(sc, bookID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"distributions": rows, "summary": summary})
}

// transactionError maps transaction domain errors to HTTP status codes.
func transactionError(c *fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	switch {
	case errors.Is(err, service.ErrTransactionNotFound):
		status = fiber.StatusNotFound
	case errors.Is(err, service.ErrSettlementTxLocked):
		status = fiber.StatusConflict
	case errors.Is(err, service.ErrMasjidNameRequired), errors.Is(err, service.ErrInvalidType),
		errors.Is(err, service.ErrInvalidAmount),
		errors.Is(err, service.ErrNotPHBIBook), errors.Is(err, service.ErrRecipientRequired),
		errors.Is(err, service.ErrInvalidDate), errors.Is(err, service.ErrBookNotFound),
		errors.Is(err, service.ErrCategoryNotFound), errors.Is(err, service.ErrCategoryMismatch),
		errors.Is(err, service.ErrCategoryBookMismatch):
		status = fiber.StatusBadRequest
	}
	return c.Status(status).JSON(fiber.Map{"error": err.Error()})
}

// DistributionBooks handles GET /api/distributions/books — the PHBI
// books a distribution can be recorded in.
func (h *TransactionHandler) DistributionBooks(c *fiber.Ctx) error {
	books, err := h.txService.PHBIBooks(scopeFrom(c))
	if err != nil {
		return transactionError(c, err)
	}
	return c.JSON(fiber.Map{"books": books})
}

// CreateDistribution handles POST /api/distributions.
func (h *TransactionHandler) CreateDistribution(c *fiber.Ctx) error {
	var input service.CreateTransactionInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	// Always a distribution in its own category, whatever the body says.
	input.Distribution, input.CategoryID = true, 0
	userID, _ := middleware.ActorUserID(c)
	tx, err := h.txService.CreateTransaction(&input, scopeFrom(c), userID)
	if err != nil {
		return transactionError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(tx)
}

// UpdateDistribution handles PUT /api/distributions/:id.
func (h *TransactionHandler) UpdateDistribution(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid distribution id"})
	}
	var input service.UpdateTransactionInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	tx, err := h.txService.UpdateDistribution(uint(id), scopeFrom(c), &input)
	if err != nil {
		return transactionError(c, err)
	}
	return c.JSON(tx)
}

// DeleteDistribution handles DELETE /api/distributions/:id.
func (h *TransactionHandler) DeleteDistribution(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid distribution id"})
	}
	if err := h.txService.DeleteDistribution(uint(id), scopeFrom(c)); err != nil {
		return transactionError(c, err)
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// CreateTransaction handles POST /api/transactions
func (h *TransactionHandler) CreateTransaction(c *fiber.Ctx) error {
	var input service.CreateTransactionInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	// A distribution row is PHBI data with its own key: the generic
	// transactions:write must not be enough to create one.
	if input.Distribution && !middleware.HasPermission(c, "distributions:write") {
		return middleware.Forbidden(c, "distributions:write")
	}
	sc := scopeFrom(c)
	userID, _ := middleware.ActorUserID(c)
	tx, err := h.txService.CreateTransaction(&input, sc, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMasjidNameRequired),
			errors.Is(err, service.ErrInvalidType),
			errors.Is(err, service.ErrInvalidAmount),
			errors.Is(err, service.ErrNotPHBIBook),
			errors.Is(err, service.ErrRecipientRequired),
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
	sc := scopeFrom(c)
	// Editing a row through the ledger still needs the distributions key
	// when the row is a "pembagian ke warga".
	isDist, err := h.txService.IsDistribution(uint(id), sc)
	if err != nil {
		return transactionError(c, err)
	}
	if isDist && !middleware.HasPermission(c, "distributions:write") {
		return middleware.Forbidden(c, "distributions:write")
	}
	tx, err := h.txService.UpdateTransaction(uint(id), sc, &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransactionNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrInvalidType),
			errors.Is(err, service.ErrInvalidAmount),
			errors.Is(err, service.ErrRecipientRequired),
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
	sc := scopeFrom(c)
	// Deleting a "pembagian ke warga" row needs distributions:delete,
	// whichever endpoint is used.
	isDist, err := h.txService.IsDistribution(uint(id), sc)
	if err != nil {
		return transactionError(c, err)
	}
	if isDist && !middleware.HasPermission(c, "distributions:delete") {
		return middleware.Forbidden(c, "distributions:delete")
	}
	if err := h.txService.DeleteTransaction(uint(id), sc); err != nil {
		return transactionError(c, err)
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// MonthlyReport handles GET /api/reports/monthly?month=YYYY-MM&book_id=
func (h *TransactionHandler) MonthlyReport(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	bookID := parseUintQuery(c, "book_id")
	report, err := h.txService.MonthlyReport(sc, bookID, c.Query("month"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(report)
}

// CategoryReport handles GET /api/reports/category?from=&to=&book_id=
func (h *TransactionHandler) CategoryReport(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	bookID := parseUintQuery(c, "book_id")
	totals, rows, err := h.txService.CategoryReport(sc, bookID, c.Query("from"), c.Query("to"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"totals": totals, "rows": rows})
}

// WeeklyReport handles GET /api/reports/weekly?from=&to=&book_id=
func (h *TransactionHandler) WeeklyReport(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	bookID := parseUintQuery(c, "book_id")
	report, err := h.txService.WeeklyReport(sc, bookID, c.Query("from"), c.Query("to"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(report)
}

// PeriodReport handles GET /api/reports/period?from=&to=
func (h *TransactionHandler) PeriodReport(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	report, err := h.txService.PeriodReport(sc, c.Query("from"), c.Query("to"))
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
