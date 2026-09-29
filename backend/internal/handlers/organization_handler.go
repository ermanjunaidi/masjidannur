package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
	"backend/pkg/middleware"
)

type OrganizationHandler struct {
	orgService *service.OrganizationService
}

func NewOrganizationHandler(orgService *service.OrganizationService) *OrganizationHandler {
	return &OrganizationHandler{orgService: orgService}
}

// GetOrganization handles GET /api/organization (settings:read).
func (h *OrganizationHandler) GetOrganization(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	org, err := h.orgService.Get(orgID)
	if err != nil {
		if errors.Is(err, service.ErrOrgNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(org)
}

// UpdateOrganization handles PUT /api/organization (settings:write).
func (h *OrganizationHandler) UpdateOrganization(c *fiber.Ctx) error {
	var input service.UpdateOrganizationInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	org, err := h.orgService.Update(orgID, &input)
	if err != nil {
		if errors.Is(err, service.ErrOrgNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(org)
}