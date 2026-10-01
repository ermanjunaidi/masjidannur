package models

import (
	"time"

	"gorm.io/gorm"
)

// Lecturing is one scheduled religious event (jadwal khatib Jumat or
// pengajian rutin) — mirrors buku-masjid's Lecturing model. Audience uses
// the same codes as the reference project: friday | public | muslimah |
// tarawih. Times are stored as plain HH:MM strings so no timezone math is
// needed (jadwal masjid is local wall-clock).
type Lecturing struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	Audience       string         `gorm:"size:20;not null;default:public" json:"audience"` // friday | public | muslimah | tarawih
	Date           string         `gorm:"size:10;not null;index" json:"date"`              // YYYY-MM-DD
	StartTime      string         `gorm:"size:5" json:"start_time"`                        // HH:MM
	EndTime        string         `gorm:"size:5" json:"end_time"`                          // HH:MM, kosong = s/d selesai
	TimeText       string         `gorm:"size:100" json:"time_text"`                       // label bebas, mis. "Ba'da Maghrib"
	LecturerName   string         `gorm:"size:255;not null" json:"lecturer_name"`          // nama khatib/pemateri
	ImamName       string         `gorm:"size:255" json:"imam_name"`
	MuadzinName    string         `gorm:"size:255" json:"muadzin_name"`
	Title          string         `gorm:"size:255" json:"title"`      // topik ceramah
	BookTitle      string         `gorm:"size:255" json:"book_title"` // kitab yang dibahas
	BookWriter     string         `gorm:"size:255" json:"book_writer"`
	VideoLink      string         `gorm:"size:500" json:"video_link"`
	AudioLink      string         `gorm:"size:500" json:"audio_link"`
	Description    string         `gorm:"size:1000" json:"description"`
	CreatedBy      uint           `json:"created_by"`
	Creator        *User          `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// Audience constants — same vocabulary as buku-masjid reference.
const (
	AudienceFriday   = "friday"
	AudiencePublic   = "public"
	AudienceMuslimah = "muslimah"
	AudienceTarawih  = "tarawih"
)

// IsValidAudience reports whether s is a known audience code.
func IsValidAudience(s string) bool {
	switch s {
	case AudienceFriday, AudiencePublic, AudienceMuslimah, AudienceTarawih:
		return true
	}
	return false
}
