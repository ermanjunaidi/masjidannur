package service

import (
	"errors"

	"backend/internal/models"
	"backend/internal/repository"
)

// BranchService handles business logic for organization branches (cabang).
type BranchService struct {
	repo *repository.BranchRepository
}

// NewBranchService wires the dependency.
func NewBranchService(repo *repository.BranchRepository) *BranchService {
	return &BranchService{repo: repo}
}

// CreateBranchInput is the payload for adding a new branch.
type CreateBranchInput struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}

// CreateBranch adds a new branch to the organization.
func (s *BranchService) CreateBranch(input *CreateBranchInput, orgID uint) (*models.Branch, error) {
	if input.Name == "" {
		return nil, ErrMissingFields
	}
	branch := &models.Branch{
		OrganizationID: orgID,
		Name:           input.Name,
		Address:        input.Address,
		Phone:          input.Phone,
		IsActive:       true,
	}
	if err := s.repo.Create(branch); err != nil {
		return nil, err
	}
	return branch, nil
}

// ListBranches returns all branches of the organization.
func (s *BranchService) ListBranches(orgID uint) ([]models.Branch, error) {
	return s.repo.FindAll(orgID)
}

// GetBranch returns a single branch.
func (s *BranchService) GetBranch(id, orgID uint) (*models.Branch, error) {
	return s.repo.FindByID(id, orgID)
}

// UpdateBranchInput is the payload for editing a branch.
type UpdateBranchInput struct {
	Name     *string `json:"name"`
	Address  *string `json:"address"`
	Phone    *string `json:"phone"`
	IsActive *bool   `json:"is_active"`
}

// UpdateBranch applies changes to a branch.
func (s *BranchService) UpdateBranch(id, orgID uint, input *UpdateBranchInput) (*models.Branch, error) {
	branch, err := s.repo.FindByID(id, orgID)
	if err != nil {
		return nil, err
	}
	if branch == nil {
		return nil, ErrBranchNotFound
	}
	if input.Name != nil {
		branch.Name = *input.Name
	}
	if input.Address != nil {
		branch.Address = *input.Address
	}
	if input.Phone != nil {
		branch.Phone = *input.Phone
	}
	if input.IsActive != nil {
		branch.IsActive = *input.IsActive
	}
	if err := s.repo.Update(branch); err != nil {
		return nil, err
	}
	return branch, nil
}

// DeleteBranch soft-deletes a branch.
func (s *BranchService) DeleteBranch(id, orgID uint) error {
	branch, err := s.repo.FindByID(id, orgID)
	if err != nil {
		return err
	}
	if branch == nil {
		return nil
	}
	return s.repo.Delete(id)
}

// ErrBranchNotFound is returned when a branch does not exist in the org.
var ErrBranchNotFound = errors.New("cabang tidak ditemukan")
