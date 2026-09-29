package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
	"backend/pkg/middleware"
)

// BranchHandler exposes CRUD over organization branches (cabang).
type BranchHandler struct {
	branchService *service.BranchService
}

// NewBranchHandler wires the dependency.
func NewBranchHandler(branchService *service.BranchService) *BranchHandler {
	return &BranchHandler{branchService: branchService}
}

// ListBranches handles GET /api/branches
func (h *BranchHandler) ListBranches(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branches, err := h.branchService.ListBranches(orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"branches": branches})
}

// GetBranch handles GET /api/branches/:id
func (h *BranchHandler) GetBranch(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid branch id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branch, err := h.branchService.GetBranch(uint(id), orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if branch == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrBranchNotFound.Error()})
	}
	return c.JSON(branch)
}

// CreateBranch handles POST /api/branches
func (h *BranchHandler) CreateBranch(c *fiber.Ctx) error {
	var input service.CreateBranchInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branch, err := h.branchService.CreateBranch(&input, orgID)
	if err != nil {
		if errors.Is(err, service.ErrMissingFields) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(branch)
}

// UpdateBranch handles PUT /api/branches/:id
func (h *BranchHandler) UpdateBranch(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid branch id"})
	}
	var input service.UpdateBranchInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branch, err := h.branchService.UpdateBranch(uint(id), orgID, &input)
	if err != nil {
		if errors.Is(err, service.ErrBranchNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(branch)
}

// DeleteBranch handles DELETE /api/branches/:id
func (h *BranchHandler) DeleteBranch(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid branch id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	if err := h.branchService.DeleteBranch(uint(id), orgID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}
