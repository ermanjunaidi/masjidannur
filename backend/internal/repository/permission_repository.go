package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

// PermissionRepository handles the permissions lookup table.
type PermissionRepository struct {
	db *gorm.DB
}

// NewPermissionRepository creates a new PermissionRepository.
func NewPermissionRepository(db *gorm.DB) *PermissionRepository {
	return &PermissionRepository{db: db}
}

// FindAll returns every permission in the table, ordered by key for
// stable ordering across requests.
func (r *PermissionRepository) FindAll() ([]models.Permission, error) {
	var perms []models.Permission
	err := r.db.Order("key ASC").Find(&perms).Error
	return perms, err
}

// FindByKey looks up a permission by its unique key. Returns (nil, nil)
// when the row is missing so callers can decide whether to seed or fail.
func (r *PermissionRepository) FindByKey(key string) (*models.Permission, error) {
	var perm models.Permission
	err := r.db.Where("key = ?", key).First(&perm).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &perm, nil
}

// Create inserts a new permission row. Caller is expected to pre-check
// uniqueness; on conflict GORM surfaces an error which is propagated.
func (r *PermissionRepository) Create(perm *models.Permission) error {
	return r.db.Create(perm).Error
}

// CountRolesUsing reports how many roles still point at this permission
// via the role_permissions pivot. Used when an admin attempts to delete a
// permission that is still wired up.
func (r *PermissionRepository) CountRolesUsing(id uint) (int64, error) {
	var count int64
	err := r.db.Table("role_permissions").Where("permission_id = ?", id).Count(&count).Error
	return count, err
}
