package models

import "time"

// Organization represents a bengkel workspace (tenant) in the SaaS model.
// Every self-registered user becomes the admin of their own organization,
// and all workshop data (customers, vehicles, spareparts, work orders,
// invoices) belongs to exactly one organization. Users with no
// organization (organization_id = 0) are platform-level superadmins who
// see everything.
type Organization struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	Phone     string    `gorm:"size:30" json:"phone"`
	Email     string    `gorm:"size:255" json:"email"`
	Address   string    `gorm:"type:text" json:"address"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}