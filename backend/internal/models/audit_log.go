package models

import "time"

// AuditLog is one entry of the audit trail: who did what, when. Entries
// are written by the audit middleware for every successful change
// (create/update/delete/import/...), every data export, and every login
// attempt. They are append-only — there is no API to edit or delete them.
type AuditLog struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	OrganizationID uint   `gorm:"index;default:0" json:"organization_id"`
	UserID         uint   `gorm:"index" json:"user_id"`
	UserName       string `gorm:"size:255" json:"user_name"` // snapshot: survives user deletion
	UserEmail      string `gorm:"size:255" json:"user_email"`
	// Action: create | update | delete | export | login | login_failed | …
	// (a sub-path such as "import" or "invite" becomes the action).
	Action     string    `gorm:"size:40;index" json:"action"`
	Resource   string    `gorm:"size:60;index" json:"resource"` // books, transactions, users, auth, …
	ResourceID uint      `json:"resource_id"`
	Method     string    `gorm:"size:10" json:"method"`
	Path       string    `gorm:"size:255" json:"path"`
	Status     int       `json:"status"`
	IP         string    `gorm:"size:64" json:"ip"`
	Detail     string    `gorm:"type:text" json:"detail"` // submitted data, secrets redacted
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}
