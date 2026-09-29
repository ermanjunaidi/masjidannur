package models

import "time"

// PasswordResetToken stores one-time reset tokens for the forgot-password
// flow. Tokens expire after 1 hour and are invalidated on use.
type PasswordResetToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	Token     string    `gorm:"size:128;uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Used      bool      `gorm:"default:false" json:"-"`
	CreatedAt time.Time `json:"created_at"`
}