package service

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// UserService encapsulates admin-side user CRUD operations.
// Auth flows (Register / Login) live in AuthService; this file is for
// the /api/users endpoints that an admin uses to manage other accounts.
type UserService struct {
	userRepo *repository.UserRepository
	roleRepo *repository.RoleRepository
}

// NewUserService wires the dependencies.
func NewUserService(userRepo *repository.UserRepository, roleRepo *repository.RoleRepository) *UserService {
	return &UserService{userRepo: userRepo, roleRepo: roleRepo}
}

// ListUsersInput is intentionally empty: pagination/filtering is not
// part of the master template scope. Easy to extend later.
type ListUsersInput struct{}

// ListUsers returns every active user with roles loaded.
func (s *UserService) ListUsers(_ *ListUsersInput, orgID uint) ([]models.User, error) {
	return s.userRepo.FindAll(orgID)
}

// GetUser returns a single user by ID.
func (s *UserService) GetUser(id uint) (*models.User, error) {
	return s.userRepo.FindByID(id)
}

// UpdateUserInput is the payload accepted by PUT /api/users/:id.
// Password is OPTIONAL — when empty, the existing hash is kept.
// RoleIDs replaces the full M2M set (NOT a delta merge).
//
// JSON tags are required: Go's default lowercase mapping would otherwise
// expect `roleids` and `isactive` while the frontend uses snake_case
// keys (`role_ids`, `is_active`). Mismatch would silently strip existing
// bindings on every edit.
type UpdateUserInput struct {
	Name           string  `json:"name,omitempty"`
	Email          string  `json:"email,omitempty"`
	Password       string  `json:"password,omitempty"`
	IsActive       *bool   `json:"is_active,omitempty"`
	RoleIDs        []uint  `json:"role_ids,omitempty"`
	DailyWage      *float64 `json:"daily_wage,omitempty"`
	DailyAllowance *float64 `json:"daily_allowance,omitempty"`
}

// UpdateUser applies the input to an existing user record.
// Email uniqueness is checked locally before save to surface 409.
func (s *UserService) UpdateUser(id uint, input *UpdateUserInput) (*models.User, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	if input.Email != "" && input.Email != user.Email {
		existing, err := s.userRepo.FindByEmail(input.Email)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if existing != nil && existing.ID != user.ID {
			return nil, ErrEmailTaken
		}
		user.Email = input.Email
	}

	if input.Name != "" {
		user.Name = input.Name
	}
	if input.IsActive != nil {
		user.IsActive = *input.IsActive
	}
	if input.DailyWage != nil {
		user.DailyWage = *input.DailyWage
	}
	if input.DailyAllowance != nil {
		user.DailyAllowance = *input.DailyAllowance
	}
	if input.Password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, errors.New("failed to hash password")
		}
		user.Password = string(hashed)
	}

	if err := s.userRepo.UpdateWithRoles(user, input.RoleIDs); err != nil {
		return nil, err
	}
	return user, nil
}

// DeleteUser removes the user with the given ID. Self-delete is blocked
// to avoid an admin accidentally locking themselves out of the dashboard.
func (s *UserService) DeleteUser(actorID, targetID, orgID uint) error {
	if targetID == 0 {
		return ErrUserNotFound
	}
	if targetID == actorID {
		return ErrSelfDeleteForbidden
	}
	user, err := s.userRepo.FindByID(targetID)
	if err != nil {
		return err
	}
	if user == nil {
		return ErrUserNotFound
	}
	return s.userRepo.Delete(targetID, orgID)
}

// Domain-level errors so the handler layer can map them to status codes
// without leaking gorm/sql details.
var (
	ErrUserNotFound       = errors.New("user not found")
	ErrEmailTaken         = errors.New("email already registered")
	ErrSelfDeleteForbidden = errors.New("admins cannot delete their own account")
)
