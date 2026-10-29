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
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	res, err := h.userService.CreateUser(orgID, branchID, &input)
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
	orgID, _ := middleware.ActorOrgID(c)
	res, err := h.userService.ResendInvite(uint(id), orgID)
	if err != nil {
		return userError(c, err)
	}
	return c.JSON(res)
}

// userError maps create/invite domain errors to HTTP status codes.
func userError(c *fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	switch {
	case errors.Is(err, service.ErrNameEmailRequired), errors.Is(err, service.ErrInvalidEmail),
		errors.Is(err, service.ErrAlreadyActivated):
		status = fiber.StatusBadRequest
	case errors.Is(err, service.ErrPlatformRoleForbidden):
		status = fiber.StatusForbidden
	case errors.Is(err, service.ErrUserNotFound):
		status = fiber.StatusNotFound
	case errors.Is(err, service.ErrUserExists), errors.Is(err, service.ErrEmailInOtherOrg),
		errors.Is(err, service.ErrEmailDeleted):
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

	orgID, _ := middleware.ActorOrgID(c)
	user, err := h.userService.UpdateUser(uint(id), orgID, &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrPlatformRoleForbidden):
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrEmailTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrPasswordTooShort):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
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
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "missing actor id",
		})
	}
	orgID, _ := middleware.ActorOrgID(c)
	if err := h.userService.DeleteUser(actorID, uint(id), orgID); err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrSelfDeleteForbidden):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}
