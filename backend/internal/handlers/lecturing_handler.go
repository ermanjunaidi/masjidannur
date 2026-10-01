package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
	"backend/pkg/middleware"
)

// LecturingHandler exposes CRUD over lecturing schedules
// (jadwal khatib Jumat + pengajian rutin).
type LecturingHandler struct {
	lecturingService *service.LecturingService
}

// NewLecturingHandler wires the dependency.
func NewLecturingHandler(lecturingService *service.LecturingService) *LecturingHandler {
	return &LecturingHandler{lecturingService: lecturingService}
}

// ListLecturings handles GET /api/lecturings?audience=&from=&to=
func (h *LecturingHandler) ListLecturings(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	items, err := h.lecturingService.ListLecturings(orgID, branchID, c.Query("audience"), c.Query("from"), c.Query("to"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"lecturings": items})
}

// CreateLecturing handles POST /api/lecturings
func (h *LecturingHandler) CreateLecturing(c *fiber.Ctx) error {
	var input service.CreateLecturingInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	userID, _ := middleware.ActorUserID(c)
	l, err := h.lecturingService.CreateLecturing(&input, orgID, branchID, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidAudience),
			errors.Is(err, service.ErrInvalidDate),
			errors.Is(err, service.ErrInvalidTime),
			errors.Is(err, service.ErrMasjidNameRequired):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(l)
}

// UpdateLecturing handles PUT /api/lecturings/:id
func (h *LecturingHandler) UpdateLecturing(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lecturing id"})
	}
	var input service.UpdateLecturingInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	l, err := h.lecturingService.UpdateLecturing(uint(id), orgID, branchID, &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrLecturingNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrInvalidAudience),
			errors.Is(err, service.ErrInvalidDate),
			errors.Is(err, service.ErrInvalidTime),
			errors.Is(err, service.ErrMasjidNameRequired):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(l)
}

// DeleteLecturing handles DELETE /api/lecturings/:id
func (h *LecturingHandler) DeleteLecturing(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lecturing id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	if err := h.lecturingService.DeleteLecturing(uint(id), orgID, branchID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": id})
}
