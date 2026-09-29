package service

import (
	"errors"

	"backend/internal/models"
	"backend/internal/repository"
)

// OrganizationService handles the bengkel (tenant) profile — the info
// shown and edited from the Settings page.
type OrganizationService struct {
	orgRepo *repository.OrganizationRepository
}

func NewOrganizationService(orgRepo *repository.OrganizationRepository) *OrganizationService {
	return &OrganizationService{orgRepo: orgRepo}
}

// UpdateOrganizationInput is the payload accepted by PUT /api/organization.
// Empty fields are left untouched (partial update semantics).
type UpdateOrganizationInput struct {
	Name    string `json:"name,omitempty"`
	Phone   string `json:"phone,omitempty"`
	Email   string `json:"email,omitempty"`
	Address string `json:"address,omitempty"`
}

// Get returns the organization for the actor. orgID == 0 means a
// platform-level superadmin with no bengkel of their own.
func (s *OrganizationService) Get(orgID uint) (*models.Organization, error) {
	if orgID == 0 {
		return nil, ErrOrgNotFound
	}
	org, err := s.orgRepo.FindByID(orgID)
	if err != nil {
		return nil, err
	}
	if org == nil {
		return nil, ErrOrgNotFound
	}
	return org, nil
}

// Update applies partial edits to the bengkel profile.
func (s *OrganizationService) Update(orgID uint, input *UpdateOrganizationInput) (*models.Organization, error) {
	if orgID == 0 {
		return nil, ErrOrgNotFound
	}
	org, err := s.orgRepo.FindByID(orgID)
	if err != nil {
		return nil, err
	}
	if org == nil {
		return nil, ErrOrgNotFound
	}
	if input.Name != "" {
		org.Name = input.Name
	}
	if input.Phone != "" {
		org.Phone = input.Phone
	}
	if input.Email != "" {
		org.Email = input.Email
	}
	if input.Address != "" {
		org.Address = input.Address
	}
	if err := s.orgRepo.Update(org); err != nil {
		return nil, err
	}
	return org, nil
}

var ErrOrgNotFound = errors.New("organisasi tidak ditemukan")
