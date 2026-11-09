package models

import (
	"time"

	"gorm.io/gorm"
)

// Permission represents a single action-key used by RBAC checks.
// Example keys: "users:read", "users:write", "roles:read".
type Permission struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"size:100;uniqueIndex;not null" json:"key"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// Role groups a set of permissions. A user can have multiple roles;
// the union of all role permissions determines effective permissions.
//
// Roles are per organization: OrganizationID 0 holds the platform's
// templates (plus the platform-only superadmin role); every laundry gets
// its own copy of the templates on creation and edits only those, so one
// tenant's changes never reach another. Names are unique per
// organization (partial unique index created at startup).
type Role struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"not null;default:0;index" json:"organization_id"`
	Name           string         `gorm:"size:50;not null" json:"name"`
	Description    string         `gorm:"size:255" json:"description"`
	Permissions    []Permission   `gorm:"many2many:role_permissions;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"permissions"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// PlatformRoleName is the role reserved for platform accounts (org 0).
// It is never copied into a laundry.
const PlatformRoleName = "superadmin"

// SeedOrganizationRoles copies every live template role (organization 0,
// except superadmin) with its permissions into orgID, skipping names the
// organization already has. Safe to re-run.
func SeedOrganizationRoles(tx *gorm.DB, orgID uint) error {
	if orgID == 0 {
		return nil
	}
	var templates []Role
	if err := tx.Preload("Permissions").
		Where("organization_id = 0 AND name <> ?", PlatformRoleName).
		Order("id ASC").Find(&templates).Error; err != nil {
		return err
	}
	for _, t := range templates {
		var count int64
		if err := tx.Model(&Role{}).Where("organization_id = ? AND name = ?", orgID, t.Name).
			Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		role := Role{OrganizationID: orgID, Name: t.Name, Description: t.Description}
		if err := tx.Omit("Permissions").Create(&role).Error; err != nil {
			return err
		}
		if len(t.Permissions) > 0 {
			if err := tx.Model(&role).Association("Permissions").Append(t.Permissions); err != nil {
				return err
			}
		}
	}
	return nil
}
