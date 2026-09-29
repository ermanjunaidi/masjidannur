package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

// BranchRepository handles database operations for organization branches.
type BranchRepository struct {
	db *gorm.DB
}

// NewBranchRepository creates a new BranchRepository.
func NewBranchRepository(db *gorm.DB) *BranchRepository {
	return &BranchRepository{db: db}
}

// Create inserts a new branch.
func (r *BranchRepository) Create(branch *models.Branch) error {
	return r.db.Create(branch).Error
}

// FindByID looks up a branch scoped by org.
func (r *BranchRepository) FindByID(id, orgID uint) (*models.Branch, error) {
	var branch models.Branch
	err := scopeOrg(r.db, orgID).First(&branch, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &branch, nil
}

// FindAll returns all branches of an org (orgID=0 → all branches).
func (r *BranchRepository) FindAll(orgID uint) ([]models.Branch, error) {
	var branches []models.Branch
	err := scopeOrg(r.db, orgID).Order("name ASC").Find(&branches).Error
	return branches, err
}

// Update saves changes on a branch.
func (r *BranchRepository) Update(branch *models.Branch) error {
	return r.db.Save(branch).Error
}

// Delete soft-deletes a branch.
func (r *BranchRepository) Delete(id uint) error {
	return r.db.Delete(&models.Branch{}, id).Error
}
