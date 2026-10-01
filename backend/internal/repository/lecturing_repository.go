package repository

import (
	"errors"

	"backend/internal/models"
	"gorm.io/gorm"
)

// LecturingRepository handles database operations for lecturing schedules
// (jadwal khatib Jumat + pengajian rutin).
type LecturingRepository struct {
	db *gorm.DB
}

// NewLecturingRepository creates a new LecturingRepository.
func NewLecturingRepository(db *gorm.DB) *LecturingRepository {
	return &LecturingRepository{db: db}
}

// Create inserts a new lecturing schedule.
func (r *LecturingRepository) Create(l *models.Lecturing) error {
	return r.db.Create(l).Error
}

// FindByID looks up a live lecturing scoped by org/branch.
func (r *LecturingRepository) FindByID(id, orgID, branchID uint) (*models.Lecturing, error) {
	var l models.Lecturing
	err := scopeBranch(r.db, orgID, branchID).First(&l, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// List returns live lecturings scoped by org/branch, newest date first.
// All filters optional; from/to are inclusive YYYY-MM-DD bounds.
func (r *LecturingRepository) List(orgID, branchID uint, audience, from, to string) ([]models.Lecturing, error) {
	query := scopeBranch(r.db.Model(&models.Lecturing{}), orgID, branchID)
	if audience != "" {
		query = query.Where("audience = ?", audience)
	}
	if from != "" {
		query = query.Where("date >= ?", from)
	}
	if to != "" {
		query = query.Where("date <= ?", to)
	}
	var items []models.Lecturing
	err := query.
		Preload("Creator", func(db *gorm.DB) *gorm.DB { return db.Select("id, name, email") }).
		Order("date DESC, start_time ASC").
		Find(&items).Error
	return items, err
}

// Update saves changes on a lecturing.
func (r *LecturingRepository) Update(l *models.Lecturing) error {
	return r.db.Save(l).Error
}

// Delete soft-deletes a lecturing.
func (r *LecturingRepository) Delete(id uint) error {
	return r.db.Delete(&models.Lecturing{}, id).Error
}
