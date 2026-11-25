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
func (r *UserRepository) CreateWithRoles(user *models.User, roleIDs, bookIDs []uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		if err := replaceBooks(tx, user, bookIDs); err != nil {
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

// FindByEmail looks up a user by email, case-insensitively (global — used
// by auth flows). Google returns lowercase emails while admins may type
// "Budi@Mail.com"; both must resolve to the same account.
func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Preload("Roles.Permissions").Where("LOWER(email) = LOWER(?)", email).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := r.attachBooks(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByEmailUnscoped is FindByEmail including soft-deleted users, whose
// email still occupies the unique index.
func (r *UserRepository) FindByEmailUnscoped(email string) (*models.User, error) {
	var user models.User
	err := r.db.Unscoped().Where("LOWER(email) = LOWER(?)", email).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByGoogleID looks up the user linked to a Google account "sub".
func (r *UserRepository) FindByGoogleID(googleID string) (*models.User, error) {
	var user models.User
	err := r.db.Preload("Roles.Permissions").Where("google_id = ?", googleID).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := r.attachBooks(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// LinkGoogle stores the Google "sub" on an existing user.
func (r *UserRepository) LinkGoogle(userID uint, googleID string) error {
	return r.db.Model(&models.User{}).Where("id = ?", userID).Update("google_id", googleID).Error
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
	if err := r.attachBooks(&user); err != nil {
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
	if err := r.attachBooks(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// FindAll returns users in an organization (orgID=0 → all users).
func (r *UserRepository) FindAll(orgID uint) ([]models.User, error) {
	var users []models.User
	if err := scopeOrg(r.db, orgID).Preload("Roles.Permissions").Order("id ASC").Find(&users).Error; err != nil {
		return nil, err
	}
	ptrs := make([]*models.User, len(users))
	for i := range users {
		ptrs[i] = &users[i]
	}
	if err := r.attachBooks(ptrs...); err != nil {
		return nil, err
	}
	return users, nil
}

// BookIDs returns the cash books a user is locked to (empty = no lock).
// Rows pointing at a deleted book are kept on purpose: a user whose only
// book was deleted stays locked (and sees nothing) instead of silently
// gaining access to every book.
func (r *UserRepository) BookIDs(userID uint) ([]uint, error) {
	ids := []uint{}
	err := r.db.Model(&models.UserBook{}).Where("user_id = ?", userID).
		Order("book_id ASC").Pluck("book_id", &ids).Error
	return ids, err
}

// attachBooks fills User.BookIDs for the given users in one query.
func (r *UserRepository) attachBooks(users ...*models.User) error {
	if len(users) == 0 {
		return nil
	}
	byID := make(map[uint]*models.User, len(users))
	ids := make([]uint, 0, len(users))
	for _, u := range users {
		u.BookIDs = []uint{}
		byID[u.ID] = u
		ids = append(ids, u.ID)
	}
	var rows []models.UserBook
	if err := r.db.Where("user_id IN ?", ids).Order("book_id ASC").Find(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		if u := byID[row.UserID]; u != nil {
			u.BookIDs = append(u.BookIDs, row.BookID)
		}
	}
	return nil
}

// replaceBooks swaps the user's book lock for bookIDs (empty = no lock).
func replaceBooks(tx *gorm.DB, user *models.User, bookIDs []uint) error {
	if err := tx.Where("user_id = ?", user.ID).Delete(&models.UserBook{}).Error; err != nil {
		return err
	}
	user.BookIDs = []uint{}
	if len(bookIDs) == 0 {
		return nil
	}
	rows := make([]models.UserBook, 0, len(bookIDs))
	for _, id := range bookIDs {
		rows = append(rows, models.UserBook{UserID: user.ID, BookID: id})
		user.BookIDs = append(user.BookIDs, id)
	}
	return tx.Create(&rows).Error
}

// UpdateWithRoles applies field changes AND replaces the role set and the
// book lock atomically. bookIDs nil keeps the current lock; an empty list
// removes it.
func (r *UserRepository) UpdateWithRoles(user *models.User, roleIDs []uint, bookIDs *[]uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(user).Error; err != nil {
			return err
		}
		if bookIDs != nil {
			if err := replaceBooks(tx, user, *bookIDs); err != nil {
				return err
			}
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
	return r.db.Model(&models.User{}).Where("id = ?", userID).
		Updates(map[string]any{"password": hash, "no_password": false}).Error
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
		if err := tx.Where("user_id = ?", user.ID).Delete(&models.UserBook{}).Error; err != nil {
			return err
		}
		return tx.Delete(user).Error
	})
}
