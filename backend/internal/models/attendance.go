package models

import (
	"time"

	"gorm.io/gorm"
)

// AttendanceDay records one employee's presence for a single day/branch.
// One row per user per date per branch (unique constraint in migration).
// Status: hadir | terlambat | izin | sakit | cuti | tanpa_keterangan | libur | belum_absen
type AttendanceDay struct {
	ID                    uint      `gorm:"primaryKey" json:"id"`
	OrganizationID        uint      `gorm:"index;default:0" json:"organization_id"`
	BranchID              uint      `gorm:"index;default:0" json:"branch_id"`
	UserID                uint      `gorm:"not null;index" json:"user_id"`
	ShiftID               *uint     `gorm:"index" json:"shift_id"`
	Date                  string    `gorm:"size:10;not null;index" json:"date"` // YYYY-MM-DD
	Status                string    `gorm:"size:30;default:belum_absen" json:"status"`
	CheckInAt             *time.Time `json:"check_in_at"`
	CheckOutAt            *time.Time `json:"check_out_at"`
	LateMinutes           int       `gorm:"default:0" json:"late_minutes"`
	WorkDurationMinutes   int       `gorm:"default:0" json:"work_duration_minutes"`
	CheckInMethod         string    `gorm:"size:20;default:manual" json:"check_in_method"` // manual | qr | gps
	Latitude              float64   `json:"latitude"`
	Longitude             float64   `json:"longitude"`
	Note                  string    `gorm:"size:500" json:"note"`
	CreatedBy             uint      `json:"created_by"`
	Shift                 *Shift    `json:"shift,omitempty"`
	User                  *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

// AttendanceLog is the audit trail of in/out/status actions.
type AttendanceLog struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	OrganizationID   uint      `gorm:"index;default:0" json:"organization_id"`
	BranchID         uint      `gorm:"index;default:0" json:"branch_id"`
	AttendanceDayID  uint      `gorm:"not null;index" json:"attendance_day_id"`
	UserID           uint      `gorm:"not null;index" json:"user_id"`
	Action           string    `gorm:"size:20;not null" json:"action"` // in | out | status_change | edited
	At               time.Time `json:"at"`
	Note             string    `gorm:"size:500" json:"note"`
	CreatedAt        time.Time `json:"created_at"`
}

// Shift defines a work period (pagi/siang/malam) with tolerance & overtime flag.
type Shift struct {
	ID                      uint           `gorm:"primaryKey" json:"id"`
	OrganizationID          uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID                uint           `gorm:"index;default:0" json:"branch_id"`
	Name                    string         `gorm:"size:100;not null" json:"name"`
	StartTime               string         `gorm:"size:5;not null" json:"start_time"` // HH:MM
	EndTime                 string         `gorm:"size:5;not null" json:"end_time"`   // HH:MM
	LateToleranceMinutes    int            `gorm:"default:15" json:"late_tolerance_minutes"`
	AllowOvertime           bool           `gorm:"default:false" json:"allow_overtime"`
	IsDefault               bool           `gorm:"default:false" json:"is_default"`
	CreatedAt               time.Time      `json:"created_at"`
	UpdatedAt               time.Time      `json:"updated_at"`
	DeletedAt               gorm.DeletedAt `gorm:"index" json:"-"`
}

// UserShiftAssignment links a user to a shift for a date range (or ongoing).
type UserShiftAssignment struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	OrganizationID uint      `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint      `gorm:"index;default:0" json:"branch_id"`
	UserID         uint      `gorm:"not null;index" json:"user_id"`
	ShiftID        uint      `gorm:"not null" json:"shift_id"`
	StartDate      string    `gorm:"size:10;index" json:"start_date"` // YYYY-MM-DD
	EndDate        string    `gorm:"size:10" json:"end_date"`         // nullable
	Shift          *Shift    `gorm:"foreignKey:ShiftID" json:"shift,omitempty"`
	User           *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// LeaveRequest is an izin/sakit/cuti application.
type LeaveRequest struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	UserID         uint           `gorm:"not null;index" json:"user_id"`
	Type           string         `gorm:"size:30;not null" json:"type"` // izin | sakit | cuti | tanpa_keterangan
	StartDate      string         `gorm:"size:10;not null" json:"start_date"`
	EndDate        string         `gorm:"size:10;not null" json:"end_date"`
	Reason         string         `gorm:"size:1000" json:"reason"`
	AttachmentURL  string         `gorm:"size:500" json:"attachment_url"`
	Status         string         `gorm:"size:20;default:menunggu" json:"status"` // menunggu | disetujui | ditolak
	ApprovedBy     uint           `json:"approved_by"`
	DecidedAt      *time.Time     `json:"decided_at"`
	User           *User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}
