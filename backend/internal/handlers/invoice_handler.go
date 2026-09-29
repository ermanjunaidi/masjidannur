package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/pkg/middleware"
	"backend/internal/service"
)

// InvoiceHandler exposes invoice creation & payment recording.
type InvoiceHandler struct {
	invService *service.InvoiceService
}

// NewInvoiceHandler wires the dependency.
func NewInvoiceHandler(invService *service.InvoiceService) *InvoiceHandler {
	return &InvoiceHandler{invService: invService}
}

// ListInvoices handles GET /api/invoices?q=...
func (h *InvoiceHandler) ListInvoices(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	invoices, err := h.invService.ListInvoices(c.Query("q"), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"invoices": invoices})
}

// GetInvoiceByNumber handles GET /api/invoices/number/:no
func (h *InvoiceHandler) GetInvoiceByNumber(c *fiber.Ctx) error {
	number := c.Params("no")
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	invoice, err := h.invService.GetInvoiceByNumber(number, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if invoice == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "invoice tidak ditemukan"})
	}
	return c.JSON(invoice)
}

// GetInvoice handles GET /api/invoices/:id
func (h *InvoiceHandler) GetInvoice(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invoice id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	invoice, err := h.invService.GetInvoice(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if invoice == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrInvoiceNotFound.Error()})
	}
	return c.JSON(invoice)
}

// CreateInvoice handles POST /api/invoices
func (h *InvoiceHandler) CreateInvoice(c *fiber.Ctx) error {
	var input service.CreateInvoiceInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	invoice, err := h.invService.CreateInvoice(&input, actorID, orgID, branchID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrWONotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrInvoiceExists):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(invoice)
}

// AddPayment handles POST /api/invoices/:id/payments
func (h *InvoiceHandler) AddPayment(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invoice id"})
	}
	var input service.AddPaymentInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	invoice, err := h.invService.AddPayment(uint(id), &input, actorID, orgID, branchID)
	if err != nil {
		if errors.Is(err, service.ErrInvoiceNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(invoice)
}
