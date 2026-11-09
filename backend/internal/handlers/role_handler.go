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

// ListRoles handles GET /api/roles: the caller organization's roles (a
// laundry sees its own copies, the platform sees the templates). The
// platform superadmin may pass ?organization_id=N to list a laundry's
// roles, e.g. to assign them while editing that laundry's user.
func (h *RoleHandler) ListRoles(c *fiber.Ctx) error {
	actor := actorFrom(c)
	if raw := c.Query("organization_id"); raw != "" && actor.OrgID == 0 {
		orgID, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid organization_id"})
		}
		actor.OrgID = uint(orgID)
	}
	roles, err := h.roleService.ListRoles(actor)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(fiber.Map{"roles": roles})
}

// roleError maps role domain errors to HTTP status codes.
func roleError(c *fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	switch {
	case errors.Is(err, service.ErrRoleNotFound):
		status = fiber.StatusNotFound
	case errors.Is(err, service.ErrRoleTaken):
		status = fiber.StatusConflict
	case errors.Is(err, service.ErrRoleNameRequired), errors.Is(err, service.ErrPermissionInvalid),
		errors.Is(err, repository.ErrRoleInUse), errors.Is(err, service.ErrRoleNameReserved):
		status = fiber.StatusBadRequest
	case errors.Is(err, service.ErrPermissionEscalation), errors.Is(err, service.ErrRoleOutranks),
		errors.Is(err, service.ErrOwnRoleChange):
		status = fiber.StatusForbidden
	case errors.Is(err, service.ErrActorUnknown):
		status = fiber.StatusUnauthorized
	}
	return c.Status(status).JSON(fiber.Map{"error": err.Error()})
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
	role, err := h.roleService.CreateRole(actorFrom(c), &input)
	if err != nil {
		return roleError(c, err)
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
	role, err := h.roleService.UpdateRole(actorFrom(c), uint(id), &input)
	if err != nil {
		return roleError(c, err)
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
	if err := h.roleService.DeleteRole(actorFrom(c), uint(id)); err != nil {
		return roleError(c, err)
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}
