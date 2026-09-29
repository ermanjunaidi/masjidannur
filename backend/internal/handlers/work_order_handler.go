package handlers

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"

	"backend/internal/repository"
	"backend/pkg/middleware"
	"backend/internal/service"
)

// WorkOrderHandler exposes work order operations.
type WorkOrderHandler struct {
	woService *service.WorkOrderService
}

// NewWorkOrderHandler wires the dependency.
func NewWorkOrderHandler(woService *service.WorkOrderService) *WorkOrderHandler {
	return &WorkOrderHandler{woService: woService}
}

// ListWorkOrders handles GET /api/work-orders?status=&date=&mechanic_id=&q=
func (h *WorkOrderHandler) ListWorkOrders(c *fiber.Ctx) error {
	status := c.Query("status")
	q := c.Query("q")
	var date *time.Time
	if d := c.Query("date"); d != "" {
		t, err := time.Parse("2006-01-02", d)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "format tanggal harus YYYY-MM-DD"})
		}
		date = &t
	}
	var mechanicID uint
	if m := c.Query("mechanic_id"); m != "" {
		mid, err := strconv.ParseUint(m, 10, 64)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid mechanic_id"})
		}
		mechanicID = uint(mid)
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wos, err := h.woService.ListWorkOrders(status, date, mechanicID, q, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"work_orders": wos})
}

// GetWorkOrder handles GET /api/work-orders/:id
func (h *WorkOrderHandler) GetWorkOrder(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.GetWorkOrder(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if wo == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrWONotFound.Error()})
	}
	return c.JSON(wo)
}

// CreateWorkOrder handles POST /api/work-orders
func (h *WorkOrderHandler) CreateWorkOrder(c *fiber.Ctx) error {
	var input service.CreateWorkOrderInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.CreateWorkOrder(&input, actorID, orgID, branchID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMissingFields):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrCustomerNotFound), errors.Is(err, service.ErrVehicleNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(wo)
}

// UpdateStatus handles PATCH /api/work-orders/:id/status  { "status": "dikerjakan" }
func (h *WorkOrderHandler) UpdateStatus(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	var input struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if input.Status == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "status wajib diisi"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.UpdateStatus(uint(id), input.Status, orgID, branchID)
	if err != nil {
		if errors.Is(err, service.ErrWONotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(wo)
}

// ApproveAdditional handles POST /api/work-orders/:id/approve
func (h *WorkOrderHandler) ApproveAdditional(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.ApproveAdditional(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(wo)
}

// RejectAdditional handles POST /api/work-orders/:id/reject
func (h *WorkOrderHandler) RejectAdditional(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.RejectAdditional(uint(id), actorID, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(wo)
}

// AddItem handles POST /api/work-orders/:id/items
func (h *WorkOrderHandler) AddItem(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	var input service.AddItemInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.AddItem(uint(id), &input, 0, orgID, branchID)
	if err != nil {
		if errors.Is(err, service.ErrWONotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(wo)
}

// RemoveItem handles DELETE /api/work-orders/:id/items/:itemID
func (h *WorkOrderHandler) RemoveItem(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	itemID, err := strconv.ParseUint(c.Params("itemID"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid item id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.RemoveItem(uint(id), uint(itemID), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(wo)
}

// AddPart handles POST /api/work-orders/:id/parts
func (h *WorkOrderHandler) AddPart(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	var input service.AddPartInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.AddPart(uint(id), &input, actorID, orgID, branchID)
	if err != nil {
		if errors.Is(err, service.ErrWONotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		if errors.Is(err, repository.ErrInsufficientStock) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "stok sparepart tidak mencukupi"})
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(wo)
}

// RemovePart handles DELETE /api/work-orders/:id/parts/:partID
func (h *WorkOrderHandler) RemovePart(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid work order id"})
	}
	partID, err := strconv.ParseUint(c.Params("partID"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid part id"})
	}
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	wo, err := h.woService.RemovePart(uint(id), uint(partID), actorID, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(wo)
}
