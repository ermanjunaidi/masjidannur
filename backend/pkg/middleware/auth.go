package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"

	"backend/pkg/jwt"
)

// claimResolver is the signature for helpers that resolve the secret
// used to sign/verify JWT tokens. Keeping this as an interface gives
// the middleware a single, testable seam for the secret provider.
type claimResolver func() string

// ctxKey constants for c.Locals lookups downstream handlers may use.
const (
	CtxUserID         = "user_id"
	CtxOrganizationID = "organization_id"
	CtxBranchID       = "branch_id"
	CtxRoles          = "user_roles"
	CtxPermissions    = "user_permissions"
)

// RequireAuth returns Fiber middleware that enforces a valid Bearer
// token on every request under its mount point. On success, it sets
// ctx.Locals(CtxUserID|...) for downstream handlers to read.
//
// On failure, returns 401 with a generic message that does not leak
// whether the JWT was malformed, expired, or simply missing — this
// follows the OWASP recommendation to give attackers no oracle.
func RequireAuth(resolver claimResolver) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := c.Get(fiber.HeaderAuthorization)
		if raw == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing or malformed authorization header",
			})
		}
		parts := strings.SplitN(raw, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing or malformed authorization header",
			})
		}
		secret := resolver()
		if secret == "" {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "auth secret not configured",
			})
		}
		claims, err := jwt.ValidateToken(parts[1], secret)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired token",
			})
		}
		c.Locals(CtxUserID, claims.UserID)
		c.Locals(CtxOrganizationID, claims.OrganizationID)
		c.Locals(CtxRoles, claims.Roles)
		c.Locals(CtxPermissions, claims.Permissions)
		// Branch ID from header overrides JWT claim (allows UI switching).
		branchHeader := c.Get("X-Branch-ID")
		branchID := claims.BranchID
		if branchHeader != "" {
			if id, err := parseUint(branchHeader); err == nil {
				branchID = id
			}
		}
		c.Locals(CtxBranchID, branchID)
		return c.Next()
	}
}

// RequirePermission returns middleware that 403s the request when the
// authenticated user lacks the given permission key. Must be mounted
// AFTER RequireAuth so ctx.Locals(CtxPermissions) is populated.
//
// `key` is the permission_key on the `permissions` table, e.g.
// "users:write", "roles:delete".
func RequirePermission(key string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw, _ := c.Locals(CtxPermissions).([]string)
		for _, p := range raw {
			if p == key {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "forbidden: missing permission " + key,
		})
	}
}

// ActorUserID is a tiny accessor for handlers that need to know who is
// making the current request (e.g. for self-delete guards).
func ActorUserID(c *fiber.Ctx) (uint, bool) {
	v, ok := c.Locals(CtxUserID).(uint)
	return v, ok
}

// ActorOrgID returns the organization id from the JWT claims. 0 means
// platform-level (superadmin) — the caller sees all organizations.
func ActorOrgID(c *fiber.Ctx) (uint, bool) {
	v, ok := c.Locals(CtxOrganizationID).(uint)
	return v, ok
}

// ActorBranchID returns the branch id from the request context.
// 0 means all branches (within the user's org).
func ActorBranchID(c *fiber.Ctx) (uint, bool) {
	v, ok := c.Locals(CtxBranchID).(uint)
	return v, ok
}

// parseUint is a tiny helper to parse a single uint from a string.
func parseUint(s string) (uint, error) {
	var v uint
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid uint")
		}
		v = v*10 + uint(c-'0')
	}
	return v, nil
}
