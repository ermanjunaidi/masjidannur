package models

import (
	"time"

	"gorm.io/gorm"
)

// Branch represents a cabang (location) of an organization's bengkel.
// An organization may have many branches; each branch owns its own
// customers, vehicles, spareparts, work orders, and invoices. Data with
// branch_id = 0 is shared across all branches of the organization.
type Branch struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	Name           string         `gorm:"size:255;not null" json:"name"`
	Address        string         `gorm:"type:text" json:"address"`
	Phone          string         `gorm:"size:30" json:"phone"`
	IsActive       bool           `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}
