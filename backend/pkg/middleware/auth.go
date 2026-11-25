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
	CtxBookIDs        = "book_ids"
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
		// Branch ID from header overrides JWT claim (allows UI switching),
		// but only for users not pinned to a branch — otherwise a
		// branch-scoped user could read any branch of the organization.
		branchHeader := c.Get("X-Branch-ID")
		branchID := claims.BranchID
		if branchHeader != "" && claims.BranchID == 0 {
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
		if HasPermission(c, key) {
			return c.Next()
		}
		return Forbidden(c, key)
	}
}

// HasPermission reports whether the authenticated actor holds key. Must be
// called after RequireAuth has populated CtxPermissions. Handlers use it
// when one route serves two resources with different permission keys, so a
// permission check cannot be expressed as route middleware alone.
func HasPermission(c *fiber.Ctx, key string) bool {
	raw, _ := c.Locals(CtxPermissions).([]string)
	for _, p := range raw {
		if p == key {
			return true
		}
	}
	return false
}

// Forbidden is the 403 response for a missing permission key. It keeps the
// message identical to RequirePermission's.
func Forbidden(c *fiber.Ctx, key string) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "forbidden: missing permission " + key,
	})
}

// RequirePlatformAdmin 403s unless the caller is platform staff
// (organization_id 0). Used for resources shared by every tenant, such
// as the global role catalog. Must be mounted AFTER RequireAuth.
func RequirePlatformAdmin() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if orgID, ok := ActorOrgID(c); ok && orgID == 0 {
			return c.Next()
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "forbidden: platform admin only",
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

// BookScope loads the cash books the authenticated user is locked to and
// stores them for ActorBookIDs. It reads the database on every request
// (not the JWT) so a lock set by an admin applies immediately, without
// waiting for the user's token to expire. Must be mounted AFTER
// RequireAuth. A failed lookup rejects the request: falling back to
// "no lock" would expose every book.
func BookScope(load func(userID uint) ([]uint, error)) fiber.Handler {
	return func(c *fiber.Ctx) error {
		uid, ok := ActorUserID(c)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing actor id",
			})
		}
		ids, err := load(uid)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "gagal memuat akses buku kas",
			})
		}
		c.Locals(CtxBookIDs, ids)
		return c.Next()
	}
}

// ActorBookIDs returns the cash books the user is locked to. Empty means
// no lock (every book of the organization).
func ActorBookIDs(c *fiber.Ctx) []uint {
	v, _ := c.Locals(CtxBookIDs).([]uint)
	return v
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
