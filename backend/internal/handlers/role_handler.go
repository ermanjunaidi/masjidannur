package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/repository"
	"backend/internal/service"
)

// RoleHandler exposes admin-side CRUD over roles and the permissions
// catalog lookup. Soft state is intentionally avoided: every endpoint
// hits the database so admin edits propagate immediately.
type RoleHandler struct {
	roleService    *service.RoleService
	permissionRepo *repository.PermissionRepository
}

// NewRoleHandler wires dependencies.
func NewRoleHandler(roleService *service.RoleService, permissionRepo *repository.PermissionRepository) *RoleHandler {
	return &RoleHandler{roleService: roleService, permissionRepo: permissionRepo}
}

// ListRoles handles GET /api/roles.
func (h *RoleHandler) ListRoles(c *fiber.Ctx) error {
	roles, err := h.roleService.ListRoles()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(fiber.Map{"roles": roles})
}

// ListPermissions handles GET /api/permissions. Returns the full catalog
// the admin UI uses to render the role-builder checkbox matrix.
func (h *RoleHandler) ListPermissions(c *fiber.Ctx) error {
	perms, err := h.permissionRepo.FindAll()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(fiber.Map{"permissions": perms})
}

// CreateRole handles POST /api/roles.
func (h *RoleHandler) CreateRole(c *fiber.Ctx) error {
	var input service.CreateRoleInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	role, err := h.roleService.CreateRole(&input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrRoleTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(role)
}

// UpdateRole handles PUT /api/roles/:id.
func (h *RoleHandler) UpdateRole(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid role id",
		})
	}
	var input service.UpdateRoleInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	role, err := h.roleService.UpdateRole(uint(id), &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrRoleNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrRoleTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(role)
}

// DeleteRole handles DELETE /api/roles/:id. Roles still assigned to any
// user yield a 400 with a clear "in use" message.
func (h *RoleHandler) DeleteRole(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid role id",
		})
	}
	if err := h.roleService.DeleteRole(uint(id)); err != nil {
		switch {
		case errors.Is(err, service.ErrRoleNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, repository.ErrRoleInUse):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}
