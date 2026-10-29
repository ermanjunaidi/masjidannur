package models

import (
	"time"

	"gorm.io/gorm"
)

// User represents a user in the system. Roles are loaded via many2many
// to roles table. The previous single-string `Role` field has been
// replaced by the M2M relation; existing rows are migrated by the
// `migrateLegacyRoleField` helper invoked in main.go.
type User struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	Name     string `gorm:"size:255;not null" json:"name"`
	Email    string `gorm:"size:255;uniqueIndex;not null" json:"email"`
	Phone    string `gorm:"size:30;index" json:"phone"`
	Password string `gorm:"size:255;not null" json:"-"`
	// NoPassword marks accounts whose Password is a random unusable hash
	// (Google signups, admin invites not yet accepted). They set a real
	// password only through an emailed link (invite / forgot password).
	NoPassword bool `gorm:"default:false" json:"-"`
	// GoogleID is the Google account "sub". Linked on the first Google
	// login with a verified matching email; NULL = not linked.
	GoogleID       *string        `gorm:"size:64;uniqueIndex" json:"-"`
	IsActive       bool           `gorm:"default:true" json:"is_active"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"` // 0 = platform-level (superadmin)
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`       // 0 = all books/branches
	Roles          []Role         `gorm:"many2many:user_roles;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"roles"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// Read-only flags for the admin UI, filled by AfterFind.
	HasPassword  bool `gorm:"-" json:"has_password"`
	GoogleLinked bool `gorm:"-" json:"google_linked"`
}

// AfterFind derives the UI flags without exposing the hash or Google ID.
func (u *User) AfterFind(_ *gorm.DB) error {
	u.HasPassword = !u.NoPassword
	u.GoogleLinked = u.GoogleID != nil
	return nil
}

// HasPermission returns true when this user has at least one role whose
// permission set contains the given key. Used in services that perform
// domain-level checks (e.g. self-promotion guard) before returning data.
func (u *User) HasPermission(key string) bool {
	for _, r := range u.Roles {
		for _, p := range r.Permissions {
			if p.Key == key {
				return true
			}
		}
	}
	return false
}

// RoleNames returns the slice of role names attached to this user.
// Convenience for JWT/serialization code paths.
func (u *User) RoleNames() []string {
	out := make([]string, 0, len(u.Roles))
	for _, r := range u.Roles {
		out = append(out, r.Name)
	}
	return out
}

// PermissionKeys returns the flattened set of permission keys across all
// roles. Used to embed in JWT claims for stateless permission checks.
func (u *User) PermissionKeys() []string {
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, r := range u.Roles {
		for _, p := range r.Permissions {
			if _, ok := seen[p.Key]; ok {
				continue
			}
			seen[p.Key] = struct{}{}
			out = append(out, p.Key)
		}
	}
	return out
}
