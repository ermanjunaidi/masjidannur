package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

type OrganizationRepository struct {
	db *gorm.DB
}

func NewOrganizationRepository(db *gorm.DB) *OrganizationRepository {
	return &OrganizationRepository{db: db}
}

func (r *OrganizationRepository) FindByID(id uint) (*models.Organization, error) {
	var org models.Organization
	err := r.db.First(&org, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &org, nil
}

func (r *OrganizationRepository) Update(org *models.Organization) error {
	return r.db.Save(org).Error
}