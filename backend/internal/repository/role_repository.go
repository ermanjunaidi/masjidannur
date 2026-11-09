package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

// RoleRepository handles database operations for roles + their permissions.
type RoleRepository struct {
	db *gorm.DB
}

// NewRoleRepository creates a new RoleRepository.
func NewRoleRepository(db *gorm.DB) *RoleRepository {
	return &RoleRepository{db: db}
}

// FindAllInOrg returns the organization's non-deleted roles (preloading
// Permissions). Organization 0 holds the platform templates.
func (r *RoleRepository) FindAllInOrg(orgID uint) ([]models.Role, error) {
	var roles []models.Role
	err := r.db.Preload("Permissions").Where("organization_id = ?", orgID).
		Order("name ASC").Find(&roles).Error
	return roles, err
}

// FindByIDInOrg looks up a role by primary key within one organization;
// a role of another organization is reported as not found.
func (r *RoleRepository) FindByIDInOrg(id, orgID uint) (*models.Role, error) {
	role, err := r.FindByID(id)
	if err != nil || role == nil || role.OrganizationID != orgID {
		return nil, err
	}
	return role, nil
}

// FindByID looks up a role by primary key, preloading permissions.
func (r *RoleRepository) FindByID(id uint) (*models.Role, error) {
	var role models.Role
	err := r.db.Preload("Permissions").First(&role, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// FindByName looks up a role by name within one organization (names are
// unique per organization; 0 = platform templates).
func (r *RoleRepository) FindByName(orgID uint, name string) (*models.Role, error) {
	var role models.Role
	err := r.db.Preload("Permissions").Where("organization_id = ? AND name = ?", orgID, name).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// Create inserts a new role, optionally with initial permission assignments.
// Returns the freshly-loaded role with permissions preloaded so callers can
// use the result directly without a second round-trip.
func (r *RoleRepository) Create(role *models.Role, permissionIDs []uint) (*models.Role, error) {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(role).Error; err != nil {
			return err
		}
		if len(permissionIDs) > 0 {
			if err := tx.Model(role).Association("Permissions").Replace(
				r.permissionEntities(tx, permissionIDs),
			); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	fresh, err := r.FindByID(role.ID)
	if err != nil {
		return nil, err
	}
	if fresh == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return fresh, nil
}

// Update applies field changes to a role AND replaces its permission set
// inside a single transaction. The caller MUST pass an explicit (possibly
// empty) slice — use UpdateFields instead when no M2M change is desired.
// Always returns the freshly reloaded role so callers see the joined
// permission set without an extra round-trip.
func (r *RoleRepository) Update(role *models.Role, permissionIDs []uint) (*models.Role, error) {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(role).Error; err != nil {
			return err
		}
		perms := r.permissionEntities(tx, permissionIDs)
		if err := tx.Model(role).Association("Permissions").Replace(perms); err != nil {
			return err
		}
		role.Permissions = perms
		return nil
	})
	if err != nil {
		return nil, err
	}
	fresh, err := r.FindByID(role.ID)
	if err != nil {
		return nil, err
	}
	if fresh == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return fresh, nil
}

// UpdateFields saves only the role's own columns (name, description, ...)
// without touching the role-permissions join table. Use this when an admin
// edits a role's metadata without intent to change permission bindings.
func (r *RoleRepository) UpdateFields(role *models.Role) (*models.Role, error) {
	if err := r.db.Save(role).Error; err != nil {
		return nil, err
	}
	fresh, err := r.FindByID(role.ID)
	if err != nil {
		return nil, err
	}
	if fresh == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return fresh, nil
}

// Delete soft-deletes a role. Returns ErrRoleInUse when user_roles still
// has rows pointing at this role so that the service layer can surface a
// clear 400 to the admin instead of a foreign-key IntegrityError.
func (r *RoleRepository) Delete(id uint) error {
	var count int64
	if err := r.db.Table("user_roles").Where("role_id = ?", id).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrRoleInUse
	}
	return r.db.Delete(&models.Role{}, id).Error
}

// CountUsersUsing returns the number of distinct users that currently
// reference this role via the user_roles pivot table.
func (r *RoleRepository) CountUsersUsing(id uint) (int64, error) {
	var count int64
	err := r.db.Table("user_roles").Where("role_id = ?", id).Count(&count).Error
	return count, err
}

// EnsurePermissions appends any permission bindings that are not yet
// present on the role without touching existing ones. Used by
// bootstrapRBAC so seed roles gain newly-added catalog permissions on
// restart without stripping admin customizations.
func (r *RoleRepository) EnsurePermissions(roleID uint, ids []uint) error {
	if len(ids) == 0 {
		return nil
	}
	role, err := r.FindByID(roleID)
	if err != nil {
		return err
	}
	if role == nil {
		return nil
	}
	have := make(map[uint]bool, len(role.Permissions))
	for _, p := range role.Permissions {
		have[p.ID] = true
	}
	missing := make([]models.Permission, 0, len(ids))
	for _, id := range ids {
		if !have[id] {
			missing = append(missing, models.Permission{ID: id})
		}
	}
	if len(missing) == 0 {
		return nil
	}
	return r.db.Model(role).Association("Permissions").Append(missing)
}

// permissionEntities hydrates the Permission primary-key slice into
// entity references suitable for GORM Association.Replace(). Caller must
// already be wrapping the call in a tx.
func (r *RoleRepository) permissionEntities(tx *gorm.DB, ids []uint) []models.Permission {
	if len(ids) == 0 {
		return []models.Permission{}
	}
	var perms []models.Permission
	tx.Where("id IN ?", ids).Find(&perms)
	return perms
}

// AppendPermissionToOrgRoles adds one permission to every tenant copy
// (organization_id <> 0) of the named role that lacks it. Used when a new
// catalog permission is introduced, so tenants receive it once without
// their later removals being undone on every restart.
func (r *RoleRepository) AppendPermissionToOrgRoles(roleName string, permissionID uint) error {
	return r.db.Exec(`INSERT INTO role_permissions (role_id, permission_id)
		SELECT id, ? FROM roles
		WHERE name = ? AND organization_id <> 0 AND deleted_at IS NULL
		  AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_id = ?)`,
		permissionID, roleName, permissionID).Error
}

// ErrRoleInUse is returned by Delete when the role is still referenced.
var ErrRoleInUse = errors.New("role is currently assigned to one or more users")
