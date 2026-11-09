package service

import (
	"errors"
	"fmt"
	"strings"

	"backend/internal/models"
	"backend/internal/repository"
)

// RoleService handles CRUD over roles and their permission assignment.
// Roles are scoped to the actor's organization: a laundry admin manages
// only its own copies, the platform superadmin (org 0) manages the
// templates new laundries are seeded from. Callers are already
// authorized via RequirePermission; the hierarchy rules live here.
type RoleService struct {
	roleRepo       *repository.RoleRepository
	permissionRepo *repository.PermissionRepository
	userRepo       *repository.UserRepository
}

// NewRoleService wires dependencies.
func NewRoleService(roleRepo *repository.RoleRepository, permissionRepo *repository.PermissionRepository, userRepo *repository.UserRepository) *RoleService {
	return &RoleService{roleRepo: roleRepo, permissionRepo: permissionRepo, userRepo: userRepo}
}

// ListRoles returns the actor organization's roles with permissions.
func (s *RoleService) ListRoles(actor Actor) ([]models.Role, error) {
	return s.roleRepo.FindAllInOrg(actor.OrgID)
}

// CreateRoleInput is the payload accepted by POST /api/roles.
// JSON tags are required so the frontend's snake_case keys map correctly.
type CreateRoleInput struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	PermissionIDs []uint `json:"permission_ids"`
}

// CreateRole inserts a new role in the actor's organization. A
// non-platform actor may only bundle permissions they hold themselves.
func (s *RoleService) CreateRole(actor Actor, input *CreateRoleInput) (*models.Role, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		return nil, ErrRoleNameRequired
	}
	perms, platform, err := s.actorAccess(actor)
	if err != nil {
		return nil, err
	}
	if !platform && strings.EqualFold(input.Name, models.PlatformRoleName) {
		return nil, ErrRoleNameReserved
	}
	existing, err := s.roleRepo.FindByName(actor.OrgID, input.Name)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrRoleTaken
	}
	ids, err := s.checkGrantable(perms, platform, input.PermissionIDs)
	if err != nil {
		return nil, err
	}
	role := &models.Role{
		OrganizationID: actor.OrgID,
		Name:           input.Name,
		Description:    input.Description,
	}
	return s.roleRepo.Create(role, ids)
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
// Non-platform rules: the role must not outrank the actor, the new set
// must be within the actor's own permissions, and the actor cannot change
// the permissions of a role they hold (no self-escalation or lockout).
func (s *RoleService) UpdateRole(actor Actor, id uint, input *UpdateRoleInput) (*models.Role, error) {
	role, err := s.roleRepo.FindByIDInOrg(id, actor.OrgID)
	if err != nil {
		return nil, err
	}
	if role == nil {
		return nil, ErrRoleNotFound
	}
	perms, platform, err := s.actorAccess(actor)
	if err != nil {
		return nil, err
	}
	if !platform {
		if err := checkRoleWithin(perms, role); err != nil {
			return nil, err
		}
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name != "" && input.Name != role.Name {
		if role.Name == models.PlatformRoleName {
			return nil, ErrRoleNameReserved
		}
		if !platform && strings.EqualFold(input.Name, models.PlatformRoleName) {
			return nil, ErrRoleNameReserved
		}
		other, err := s.roleRepo.FindByName(actor.OrgID, input.Name)
		if err != nil {
			return nil, err
		}
		if other != nil && other.ID != role.ID {
			return nil, ErrRoleTaken
		}
		role.Name = input.Name
	}
	role.Description = input.Description

	// `PermissionIDs == nil` -> do not touch the join table at all, so
	// admins can rename a role without wiping its permissions by accident.
	if input.PermissionIDs == nil {
		return s.roleRepo.UpdateFields(role)
	}
	ids, err := s.checkGrantable(perms, platform, *input.PermissionIDs)
	if err != nil {
		return nil, err
	}
	if !platform && !sameIDs(ids, permissionIDsOf(role)) {
		held, err := s.actorHoldsRole(actor, role.ID)
		if err != nil {
			return nil, err
		}
		if held {
			return nil, ErrOwnRoleChange
		}
	}
	return s.roleRepo.Update(role, ids)
}

// DeleteRole removes a role of the actor's organization, guarded against
// in-use pivot rows (ErrRoleInUse) and against roles that outrank the
// actor.
func (s *RoleService) DeleteRole(actor Actor, id uint) error {
	role, err := s.roleRepo.FindByIDInOrg(id, actor.OrgID)
	if err != nil {
		return err
	}
	if role == nil {
		return ErrRoleNotFound
	}
	if role.Name == models.PlatformRoleName && actor.OrgID == 0 {
		return ErrRoleNameReserved
	}
	perms, platform, err := s.actorAccess(actor)
	if err != nil {
		return err
	}
	if !platform {
		if err := checkRoleWithin(perms, role); err != nil {
			return err
		}
	}
	return s.roleRepo.Delete(id)
}

// actorAccess loads the actor's current permissions from the database
// (not the JWT, which may be stale). platform is true for the platform
// superadmin, who bypasses the hierarchy rules.
func (s *RoleService) actorAccess(actor Actor) (map[string]bool, bool, error) {
	u, err := s.userRepo.FindByID(actor.ID)
	if err != nil {
		return nil, false, err
	}
	if u == nil || !u.IsActive || u.OrganizationID != actor.OrgID {
		return nil, false, ErrActorUnknown
	}
	platform := false
	for _, r := range u.Roles {
		if r.Name == models.PlatformRoleName && u.OrganizationID == 0 {
			platform = true
		}
	}
	return permissionSet(u.Roles), platform, nil
}

func (s *RoleService) actorHoldsRole(actor Actor, roleID uint) (bool, error) {
	u, err := s.userRepo.FindByID(actor.ID)
	if err != nil || u == nil {
		return false, err
	}
	for _, r := range u.Roles {
		if r.ID == roleID {
			return true, nil
		}
	}
	return false, nil
}

// checkGrantable resolves the requested permission ids (deduplicated,
// unknown ids rejected) and, for a non-platform actor, rejects any
// permission the actor does not hold.
func (s *RoleService) checkGrantable(perms map[string]bool, platform bool, ids []uint) ([]uint, error) {
	seen := map[uint]bool{}
	out := make([]uint, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	found, err := s.permissionRepo.FindByIDs(out)
	if err != nil {
		return nil, err
	}
	if len(found) != len(out) {
		return nil, ErrPermissionInvalid
	}
	if !platform {
		for _, p := range found {
			if !perms[p.Key] {
				return nil, fmt.Errorf("%w (%s)", ErrPermissionEscalation, p.Key)
			}
		}
	}
	return out, nil
}

// checkRoleWithin rejects a role holding a permission the actor lacks.
func checkRoleWithin(perms map[string]bool, role *models.Role) error {
	for _, p := range role.Permissions {
		if !perms[p.Key] {
			return ErrRoleOutranks
		}
	}
	return nil
}

func permissionIDsOf(role *models.Role) []uint {
	out := make([]uint, len(role.Permissions))
	for i, p := range role.Permissions {
		out[i] = p.ID
	}
	return out
}

// Domain errors.
var (
	ErrRoleNotFound         = errors.New("role not found")
	ErrRoleTaken            = errors.New("role name already in use")
	ErrRoleNameRequired     = errors.New("nama role wajib diisi")
	ErrRoleNameReserved     = errors.New("nama role superadmin khusus akun platform")
	ErrPermissionInvalid    = errors.New("izin tidak dikenal")
	ErrPermissionEscalation = errors.New("tidak bisa memberi izin yang tidak anda miliki")
	ErrRoleOutranks         = errors.New("role ini punya izin yang tidak anda miliki, tidak bisa diubah/dihapus")
	ErrOwnRoleChange        = errors.New("tidak bisa mengubah izin role yang anda pakai sendiri; minta admin lain atau superadmin platform")
)
