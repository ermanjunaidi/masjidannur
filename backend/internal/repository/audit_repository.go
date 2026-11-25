package repository

import (
	"gorm.io/gorm"

	"backend/internal/models"
)

// AuditRepository stores and lists audit trail entries.
type AuditRepository struct {
	db *gorm.DB
}

// NewAuditRepository creates a new AuditRepository.
func NewAuditRepository(db *gorm.DB) *AuditRepository {
	return &AuditRepository{db: db}
}

// Create appends one entry.
func (r *AuditRepository) Create(entry *models.AuditLog) error {
	return r.db.Create(entry).Error
}

// Actor is the name/email/organization snapshot of a user.
type Actor struct {
	Name           string
	Email          string
	OrganizationID uint
}

// Actor looks up the snapshot stored with an entry (deleted users included).
func (r *AuditRepository) Actor(userID uint) Actor {
	var a Actor
	r.db.Unscoped().Model(&models.User{}).Select("name, email, organization_id").Where("id = ?", userID).Scan(&a)
	return a
}

// ActorByEmail resolves the account a login attempt was aimed at.
func (r *AuditRepository) ActorByEmail(email string) (uint, Actor) {
	var row struct {
		ID uint
		Actor
	}
	r.db.Model(&models.User{}).Select("id, name, email, organization_id").
		Where("LOWER(email) = LOWER(?)", email).Scan(&row)
	return row.ID, row.Actor
}

// AuditFilter narrows List. Zero values mean "any".
type AuditFilter struct {
	From, To string // YYYY-MM-DD, inclusive
	Resource string
	Action   string
	UserID   uint
	Search   string
	Page     int
	PageSize int
}

// List returns one page of an organization's entries, newest first, plus
// the total matching count. orgID 0 (platform) sees every organization.
func (r *AuditRepository) List(orgID uint, f AuditFilter) ([]models.AuditLog, int64, error) {
	q := scopeOrg(r.db.Model(&models.AuditLog{}), orgID)
	if f.From != "" {
		q = q.Where("created_at >= ?", f.From+" 00:00:00")
	}
	if f.To != "" {
		q = q.Where("created_at <= ?", f.To+" 23:59:59.999")
	}
	if f.Resource != "" {
		q = q.Where("resource = ?", f.Resource)
	}
	if f.Action != "" {
		q = q.Where("action = ?", f.Action)
	}
	if f.UserID > 0 {
		q = q.Where("user_id = ?", f.UserID)
	}
	if f.Search != "" {
		like := "%" + f.Search + "%"
		q = q.Where("LOWER(user_name) LIKE LOWER(?) OR LOWER(user_email) LIKE LOWER(?) OR LOWER(detail) LIKE LOWER(?) OR LOWER(path) LIKE LOWER(?)",
			like, like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var logs []models.AuditLog
	err := q.Order("id DESC").Limit(f.PageSize).Offset((f.Page - 1) * f.PageSize).Find(&logs).Error
	return logs, total, err
}
