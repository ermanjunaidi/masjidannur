package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

// UserRepository handles database operations for users.
//
// Auth paths (login / register / me) look users up globally by
// email/id. Admin management paths are scoped to an organization so an
// admin can only see/manage users inside their own masjid; orgID=0
// (superadmin) sees every user.
type UserRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new UserRepository.
func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create inserts a brand new user. The Password field MUST already be
// bcrypt-hashed by the caller.
func (r *UserRepository) Create(user *models.User) error {
	return r.db.Create(user).Error
}

// CreateWithRoles inserts a user and attaches the provided roles in a
// single transaction. Caller sets user.OrganizationID.
func (r *UserRepository) CreateWithRoles(user *models.User, roleIDs []uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		if len(roleIDs) == 0 {
			return nil
		}
		var roles []models.Role
		if err := tx.Where("id IN ?", roleIDs).Find(&roles).Error; err != nil {
			return err
		}
		if err := tx.Model(user).Association("Roles").Replace(roles); err != nil {
			return err
		}
		user.Roles = roles
		return nil
	})
}

// FindByEmail looks up a user by email (global — used by auth flows).
func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Preload("Roles.Permissions").Where("email = ?", email).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByID looks up a user by primary key with roles loaded (global — auth).
func (r *UserRepository) FindByID(id uint) (*models.User, error) {
	var user models.User
	err := r.db.Preload("Roles.Permissions").First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByIDInOrg looks up a user scoped to an organization (admin mgmt).
func (r *UserRepository) FindByIDInOrg(id, orgID uint) (*models.User, error) {
	var user models.User
	err := scopeOrg(r.db, orgID).Preload("Roles.Permissions").First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindAll returns users in an organization (orgID=0 → all users).
func (r *UserRepository) FindAll(orgID uint) ([]models.User, error) {
	var users []models.User
	err := scopeOrg(r.db, orgID).Preload("Roles.Permissions").Order("id ASC").Find(&users).Error
	return users, err
}

// UpdateWithRoles applies field changes AND replaces the role set atomically.
func (r *UserRepository) UpdateWithRoles(user *models.User, roleIDs []uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(user).Error; err != nil {
			return err
		}
		var roles []models.Role
		if len(roleIDs) > 0 {
			if err := tx.Where("id IN ?", roleIDs).Find(&roles).Error; err != nil {
				return err
			}
		} else {
			roles = []models.Role{}
		}
		if err := tx.Model(user).Association("Roles").Replace(roles); err != nil {
			return err
		}
		user.Roles = roles
		return nil
	})
}

// UpdatePassword updates only the password hash for a user (self-service
// change-password). Used by the Security page.
func (r *UserRepository) UpdatePassword(userID uint, hash string) error {
	return r.db.Model(&models.User{}).Where("id = ?", userID).Update("password", hash).Error
}

// Delete soft-deletes a user by ID, scoped to an organization.
func (r *UserRepository) Delete(id, orgID uint) error {
	user, err := r.FindByIDInOrg(id, orgID)
	if err != nil {
		return err
	}
	if user == nil {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(user).Association("Roles").Clear(); err != nil {
			return err
		}
		return tx.Delete(user).Error
	})
}
