package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

// ResidentRepository handles database operations for the resident list.
type ResidentRepository struct {
	db *gorm.DB
}

// NewResidentRepository creates a new ResidentRepository.
func NewResidentRepository(db *gorm.DB) *ResidentRepository {
	return &ResidentRepository{db: db}
}

// FindAll returns the residents of an org/branch ordered by RW, RT, name.
func (r *ResidentRepository) FindAll(orgID, branchID uint) ([]models.Resident, error) {
	var list []models.Resident
	err := scopeBranch(r.db, orgID, branchID).Order("rw ASC, rt ASC, name ASC, id ASC").Find(&list).Error
	return list, err
}

// FindByID looks up a live resident scoped by org/branch.
func (r *ResidentRepository) FindByID(id, orgID, branchID uint) (*models.Resident, error) {
	var res models.Resident
	err := scopeBranch(r.db, orgID, branchID).First(&res, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &res, nil
}

// Create inserts one resident.
func (r *ResidentRepository) Create(res *models.Resident) error {
	return r.db.Create(res).Error
}

// CreateMany inserts residents in one transaction (all or nothing).
func (r *ResidentRepository) CreateMany(list []models.Resident) error {
	if len(list) == 0 {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		return tx.CreateInBatches(&list, 200).Error
	})
}

// Update saves changes on a resident.
func (r *ResidentRepository) Update(res *models.Resident) error {
	return r.db.Save(res).Error
}

// Delete soft-deletes a resident.
func (r *ResidentRepository) Delete(id uint) error {
	return r.db.Delete(&models.Resident{}, id).Error
}
