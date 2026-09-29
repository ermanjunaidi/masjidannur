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

// FindAll returns all non-deleted roles (preloading Permissions).
func (r *RoleRepository) FindAll() ([]models.Role, error) {
	var roles []models.Role
	err := r.db.Preload("Permissions").Order("name ASC").Find(&roles).Error
	return roles, err
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

// FindByName looks up a role by its unique name.
func (r *RoleRepository) FindByName(name string) (*models.Role, error) {
	var role models.Role
	err := r.db.Preload("Permissions").Where("name = ?", name).First(&role).Error
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

// ErrRoleInUse is returned by Delete when the role is still referenced.
var ErrRoleInUse = errors.New("role is currently assigned to one or more users")
