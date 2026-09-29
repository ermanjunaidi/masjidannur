package models

import (
	"time"

	"gorm.io/gorm"
)

// Customer represents a workshop customer. Phone is the natural unique
// identifier for a local bengkel; email remains optional.
//
// Phone uniqueness is per-organization (multi-tenant), NOT global: the
// partial unique index `idx_customers_org_phone` is created at startup
// (see cmd/server/main.go). Do NOT re-add `uniqueIndex` here — a global
// index would let bengkel A block bengkel B from registering the same
// customer phone number.
type Customer struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	Name           string         `gorm:"size:255;not null" json:"name"`
	Phone          string         `gorm:"size:50;not null" json:"phone"`
	Email          string         `gorm:"size:255" json:"email"`
	Address        string         `gorm:"size:500" json:"address"`
	Notes          string         `gorm:"size:1000" json:"notes"`
	Vehicles       []Vehicle      `gorm:"foreignKey:CustomerID" json:"vehicles,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// Vehicle represents a customer's vehicle (motor or mobil).
//
// Plate uniqueness is per-organization (multi-tenant), NOT global — see
// Customer above and migrateTenantUniqueIndexes in cmd/server/main.go.
type Vehicle struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	CustomerID     uint           `gorm:"not null;index" json:"customer_id"`
	Brand          string         `gorm:"size:100;not null" json:"brand"`
	Model          string         `gorm:"size:100" json:"model"`
	Year           int            `json:"year"`
	Plate          string         `gorm:"size:20;not null" json:"plate"`
	VIN            string         `gorm:"size:50" json:"vin"`
	Type           string         `gorm:"size:20;default:motor" json:"type"` // motor | mobil
	Color          string         `gorm:"size:50" json:"color"`
	LastKM         int            `json:"last_km"`
	Customer       *Customer      `gorm:"foreignKey:CustomerID" json:"customer,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}
