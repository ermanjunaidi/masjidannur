package models

import (
	"time"

	"gorm.io/gorm"
)

// Resident is one warga in the masjid's resident list (daftar warga):
// the people a Ramadhan book's "pembagian ke warga" is handed out to.
// The list belongs to the organization, not to one cash book.
type Resident struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	Name           string         `gorm:"size:255;not null" json:"name"`
	RT             string         `gorm:"size:10" json:"rt"`
	RW             string         `gorm:"size:10" json:"rw"`
	Note           string         `gorm:"size:500" json:"note"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}
