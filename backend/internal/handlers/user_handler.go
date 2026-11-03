package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
	"backend/pkg/middleware"
)

// UserHandler exposes admin-side CRUD over users.
type UserHandler struct {
	userService *service.UserService
}

// NewUserHandler wires the dependency.
func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

// ListUsers handles GET /api/users — admin-only.
func (h *UserHandler) ListUsers(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	users, err := h.userService.ListUsers(&service.ListUsersInput{}, orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(fiber.Map{"users": users})
}

// CreateUser handles POST /api/users: add a user to the actor's
// organization and send them an invite (no admin-chosen password).
func (h *UserHandler) CreateUser(c *fiber.Ctx) error {
	var input service.CreateUserInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	branchID, _ := middleware.ActorBranchID(c)
	res, err := h.userService.CreateUser(actorFrom(c), branchID, &input)
	if err != nil {
		return userError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// ResendInvite handles POST /api/users/:id/invite.
func (h *UserHandler) ResendInvite(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid user id",
		})
	}
	res, err := h.userService.ResendInvite(actorFrom(c), uint(id))
	if err != nil {
		return userError(c, err)
	}
	return c.JSON(res)
}

// userError maps create/invite domain errors to HTTP status codes.
// actorFrom builds the service actor from the JWT locals.
func actorFrom(c *fiber.Ctx) service.Actor {
	id, _ := middleware.ActorUserID(c)
	orgID, _ := middleware.ActorOrgID(c)
	return service.Actor{ID: id, OrgID: orgID}
}

func userError(c *fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	switch {
	case errors.Is(err, service.ErrNameEmailRequired), errors.Is(err, service.ErrInvalidEmail),
		errors.Is(err, service.ErrAlreadyActivated), errors.Is(err, service.ErrRoleRequired),
		errors.Is(err, service.ErrRoleInvalid), errors.Is(err, service.ErrSelfRoleChange),
		errors.Is(err, service.ErrSelfDeactivate), errors.Is(err, service.ErrSelfDeleteForbidden), errors.Is(err, service.ErrPasswordTooShort):
		status = fiber.StatusBadRequest
	case errors.Is(err, service.ErrPlatformRoleForbidden), errors.Is(err, service.ErrRoleEscalation),
		errors.Is(err, service.ErrTargetOutranks):
		status = fiber.StatusForbidden
	case errors.Is(err, service.ErrActorUnknown):
		status = fiber.StatusUnauthorized
	case errors.Is(err, service.ErrUserNotFound):
		status = fiber.StatusNotFound
	case errors.Is(err, service.ErrUserExists), errors.Is(err, service.ErrEmailInOtherOrg),
		errors.Is(err, service.ErrEmailDeleted), errors.Is(err, service.ErrEmailTaken):
		status = fiber.StatusConflict
	}
	return c.Status(status).JSON(fiber.Map{"error": err.Error()})
}

// GetUser handles GET /api/users/:id.
func (h *UserHandler) GetUser(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid user id",
		})
	}
	orgID, _ := middleware.ActorOrgID(c)
	user, err := h.userService.GetUser(uint(id), orgID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	if user == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": service.ErrUserNotFound.Error(),
		})
	}
	return c.JSON(user)
}

// UpdateUser handles PUT /api/users/:id with optional password.
func (h *UserHandler) UpdateUser(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid user id",
		})
	}
	var input service.UpdateUserInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	user, err := h.userService.UpdateUser(actorFrom(c), uint(id), &input)
	if err != nil {
		return userError(c, err)
	}
	return c.JSON(user)
}

// DeleteUser handles DELETE /api/users/:id. Self-delete is forbidden.
func (h *UserHandler) DeleteUser(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid user id",
		})
	}
	if _, ok := middleware.ActorUserID(c); !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "missing actor id",
		})
	}
	if err := h.userService.DeleteUser(actorFrom(c), uint(id)); err != nil {
		return userError(c, err)
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}
