package service

import (
	"errors"

	"backend/internal/models"
	"backend/internal/repository"
)

// RoleService handles CRUD over roles and their permission assignment.
// All ops run with the assumption that the caller has already been
// authorized via the RequirePermission middleware.
type RoleService struct {
	roleRepo       *repository.RoleRepository
	permissionRepo *repository.PermissionRepository
}

// NewRoleService wires dependencies.
func NewRoleService(roleRepo *repository.RoleRepository, permissionRepo *repository.PermissionRepository) *RoleService {
	return &RoleService{roleRepo: roleRepo, permissionRepo: permissionRepo}
}

// ListRoles returns all roles with their permissions preloaded.
func (s *RoleService) ListRoles() ([]models.Role, error) {
	return s.roleRepo.FindAll()
}

// CreateRoleInput is the payload accepted by POST /api/roles.
// JSON tags are required so the frontend's snake_case keys map correctly.
type CreateRoleInput struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	PermissionIDs []uint `json:"permission_ids"`
}

// CreateRole inserts a new role row + initial permission mappings.
// Duplicate name is rejected with ErrRoleTaken so the admin UI can show
// a clear message instead of a generic 500 from the DB constraint.
func (s *RoleService) CreateRole(input *CreateRoleInput) (*models.Role, error) {
	if input.Name == "" {
		return nil, errors.New("role name is required")
	}
	existing, err := s.roleRepo.FindByName(input.Name)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrRoleTaken
	}
	role := &models.Role{
		Name:        input.Name,
		Description: input.Description,
	}
	if role, err = s.roleRepo.Create(role, input.PermissionIDs); err != nil {
		return nil, err
	}
	return role, nil
}

// UpdateRoleInput is the payload accepted by PUT /api/roles/:id.
// Name & Description may be partial; PermissionIDs REPLACES the set.
//
// Semantics of PermissionIDs:
//   - omitted / nil  -> leave existing permission bindings untouched
//   - [] (empty)     -> strip ALL permissions from this role
//   - [1,2,3]        -> replace with the given ids (delta merge in DB)
type UpdateRoleInput struct {
	Name          string  `json:"name,omitempty"`
	Description   string  `json:"description,omitempty"`
	PermissionIDs *[]uint `json:"permission_ids,omitempty"`
}

// UpdateRole applies field changes and rewrites the permission set.
// Uniqueness is enforced for name changes against OTHER roles.
func (s *RoleService) UpdateRole(id uint, input *UpdateRoleInput) (*models.Role, error) {
	role, err := s.roleRepo.FindByID(id)
	if err != nil {
		return nil, err
	}
	if role == nil {
		return nil, ErrRoleNotFound
	}
	if input.Name != "" && input.Name != role.Name {
		other, err := s.roleRepo.FindByName(input.Name)
		if err != nil {
			return nil, err
		}
		if other != nil && other.ID != role.ID {
			return nil, ErrRoleTaken
		}
		role.Name = input.Name
	}
	role.Description = input.Description

	// `PermissionIDs == nil` -> do not touch the join table at all. The
	// repository distinguishes this from `&[]` (sentinel) so admins can
	// rename a role without wiping its permissions by accident.
	if input.PermissionIDs == nil {
		return s.roleRepo.UpdateFields(role)
	}
	return s.roleRepo.Update(role, *input.PermissionIDs)
}

// DeleteRole removes a role by ID, guarded against in-use pivot rows.
// The ErrRoleInUse sentinel is mapped to 400 by the handler layer.
func (s *RoleService) DeleteRole(id uint) error {
	role, err := s.roleRepo.FindByID(id)
	if err != nil {
		return err
	}
	if role == nil {
		return ErrRoleNotFound
	}
	if err := s.roleRepo.Delete(id); err != nil {
		return err
	}
	return nil
}

// Domain errors.
var (
	ErrRoleNotFound = errors.New("role not found")
	ErrRoleTaken    = errors.New("role name already in use")
)
