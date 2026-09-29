package handlers

import (
	"github.com/gofiber/fiber/v2"

	"backend/pkg/middleware"
	"backend/internal/service"
)

// DashboardHandler exposes the operational summary.
type DashboardHandler struct {
	dashService *service.DashboardService
}

// NewDashboardHandler wires the dependency.
func NewDashboardHandler(dashService *service.DashboardService) *DashboardHandler {
	return &DashboardHandler{dashService: dashService}
}

// Summary handles GET /api/dashboard/summary
func (h *DashboardHandler) Summary(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	summary, err := h.dashService.Summary(orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(summary)
}
