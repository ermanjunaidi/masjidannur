package service

import (
	"errors"
	"fmt"
	"log"
	"strings"

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
	inviter  Inviter
}

// Inviter delivers the "set your password" link to an admin-created user
// (implemented by AuthService.SendInvite).
type Inviter interface {
	SendInvite(user *models.User) (link string, emailed bool, err error)
}

// NewUserService wires the dependencies.
func NewUserService(userRepo *repository.UserRepository, roleRepo *repository.RoleRepository, inviter Inviter) *UserService {
	return &UserService{userRepo: userRepo, roleRepo: roleRepo, inviter: inviter}
}

// CreateUserInput is the payload accepted by POST /api/users. There is
// deliberately no password: the user sets one through the invite link or
// signs in with Google, so the admin never knows it.
type CreateUserInput struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	RoleIDs []uint `json:"role_ids"`
}

// InviteResult tells the admin how the invite was delivered. InviteLink
// is only set when it could not be emailed, so the admin can share it.
type InviteResult struct {
	User       *models.User `json:"user"`
	InviteSent bool         `json:"invite_sent"`
	InviteLink string       `json:"invite_link,omitempty"`
}

// CreateUser adds a user to the actor's organization and sends an invite.
//
// One email = one account. If the email already exists — including an
// account the person created themselves with "Daftar dengan Google" — no
// second account is created: the same-org case points the admin to Edit,
// and an account in another organization is never moved (that would hand
// over someone else's workspace). branchID is the actor's book/branch scope,
// inherited by the new account.
func (s *UserService) CreateUser(orgID, branchID uint, input *CreateUserInput) (*InviteResult, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Email = NormalizeEmail(input.Email)
	if input.Name == "" || input.Email == "" {
		return nil, ErrNameEmailRequired
	}
	if at := strings.Index(input.Email, "@"); at < 1 || at == len(input.Email)-1 {
		return nil, ErrInvalidEmail
	}

	existing, err := s.userRepo.FindByEmailUnscoped(input.Email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		switch {
		case existing.DeletedAt.Valid:
			return nil, ErrEmailDeleted
		case existing.OrganizationID == orgID:
			return nil, ErrUserExists
		default:
			return nil, ErrEmailInOtherOrg
		}
	}

	hashed, err := UnusablePasswordHash()
	if err != nil {
		return nil, err
	}
	user := &models.User{
		Name:           input.Name,
		Email:          input.Email,
		Password:       hashed,
		NoPassword:     true,
		IsActive:       true,
		OrganizationID: orgID,
		BranchID:       branchID,
	}
	if err := s.checkPlatformRole(user, input.RoleIDs); err != nil {
		return nil, err
	}
	if err := s.userRepo.CreateWithRoles(user, input.RoleIDs); err != nil {
		return nil, err
	}

	full, err := s.userRepo.FindByID(user.ID)
	if err != nil || full == nil {
		return nil, errors.New("failed to load created user")
	}
	return s.invite(full), nil
}

// ResendInvite issues a fresh invite link for a user who has not set a
// password yet. Accounts that already have one use "lupa password".
func (s *UserService) ResendInvite(id, orgID uint) (*InviteResult, error) {
	user, err := s.userRepo.FindByIDInOrg(id, orgID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUserNotFound
	}
	if !user.NoPassword {
		return nil, ErrAlreadyActivated
	}
	return s.invite(user), nil
}

// invite never fails the request: the user exists either way, and a
// failed delivery just means the admin resends later.
func (s *UserService) invite(user *models.User) *InviteResult {
	res := &InviteResult{User: user}
	if s.inviter == nil {
		return res
	}
	link, emailed, err := s.inviter.SendInvite(user)
	if err != nil {
		log.Printf("[users] undangan %s gagal dibuat: %v", user.Email, err)
		return res
	}
	res.InviteSent, res.InviteLink = emailed, link
	return res
}

// ListUsersInput is intentionally empty: pagination/filtering is not
// part of the master template scope. Easy to extend later.
type ListUsersInput struct{}

// ListUsers returns every active user with roles loaded.
func (s *UserService) ListUsers(_ *ListUsersInput, orgID uint) ([]models.User, error) {
	return s.userRepo.FindAll(orgID)
}

// GetUser returns a single user by ID within the actor's organization
// (orgID=0 → any user).
func (s *UserService) GetUser(id, orgID uint) (*models.User, error) {
	return s.userRepo.FindByIDInOrg(id, orgID)
}

// MinPasswordLength is the shortest password accepted anywhere a user
// sets one (register, reset, change, admin create/update).
const MinPasswordLength = 8

// PlatformRoleName is the role reserved for platform-level staff. It
// can never be granted through the tenant admin user-management
// endpoints — only the seed/bootstrap flow may assign it.
const PlatformRoleName = "superadmin"

// filterPlatformRoles drops platform-level role IDs (superadmin) from
// the requested set so a tenant admin cannot escalate anyone (or
// themselves) to platform staff via POST/PUT /api/users.
func (s *UserService) filterPlatformRoles(roleIDs []uint) ([]uint, error) {
	if len(roleIDs) == 0 {
		return roleIDs, nil
	}
	clean := make([]uint, 0, len(roleIDs))
	for _, id := range roleIDs {
		role, err := s.roleRepo.FindByID(id)
		if err != nil {
			return nil, err
		}
		if role == nil {
			continue
		}
		if role.Name == PlatformRoleName {
			continue // silently strip — the role picker hides it anyway
		}
		clean = append(clean, id)
	}
	return clean, nil
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
	Name     string `json:"name,omitempty"`
	Email    string `json:"email,omitempty"`
	Password string `json:"password,omitempty"`
	IsActive *bool  `json:"is_active,omitempty"`
	RoleIDs  []uint `json:"role_ids,omitempty"`
}

// UpdateUser applies the input to an existing user record in the actor's
// organization (orgID=0 → any user). Email uniqueness is checked locally
// before save to surface 409.
func (s *UserService) UpdateUser(id, orgID uint, input *UpdateUserInput) (*models.User, error) {
	user, err := s.userRepo.FindByIDInOrg(id, orgID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUserNotFound
	}
	if err := s.checkPlatformRole(user, input.RoleIDs); err != nil {
		return nil, err
	}

	input.Email = NormalizeEmail(input.Email)
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
	if input.Password != "" {
		if len(input.Password) < MinPasswordLength {
			return nil, ErrPasswordTooShort
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, errors.New("failed to hash password")
		}
		user.Password = string(hashed)
		user.NoPassword = false
	}

	// Strip platform-level roles from admin-supplied role sets so the
	// tenant user-management endpoints can never grant superadmin.
	roleIDs, err := s.filterPlatformRoles(input.RoleIDs)
	if err != nil {
		return nil, err
	}
	if err := s.userRepo.UpdateWithRoles(user, roleIDs); err != nil {
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
	user, err := s.userRepo.FindByIDInOrg(targetID, orgID)
	if err != nil {
		return err
	}
	if user == nil {
		return ErrUserNotFound
	}
	return s.userRepo.Delete(targetID, orgID)
}

// checkPlatformRole keeps the superadmin role off tenant accounts. Only
// org-0 users may hold it, and only a platform actor can reach those.
func (s *UserService) checkPlatformRole(user *models.User, roleIDs []uint) error {
	if user.OrganizationID == 0 || len(roleIDs) == 0 {
		return nil
	}
	platform, err := s.roleRepo.FindByName(platformRoleName)
	if err != nil {
		return err
	}
	if platform == nil {
		return nil
	}
	for _, id := range roleIDs {
		if id == platform.ID {
			return ErrPlatformRoleForbidden
		}
	}
	return nil
}

// Domain-level errors so the handler layer can map them to status codes
// without leaking gorm/sql details.
var (
	ErrPasswordTooShort      = fmt.Errorf("password minimal %d karakter", MinPasswordLength)
	ErrUserNotFound          = errors.New("user not found")
	ErrEmailTaken            = errors.New("email already registered")
	ErrSelfDeleteForbidden   = errors.New("admins cannot delete their own account")
	ErrPlatformRoleForbidden = errors.New("role superadmin hanya untuk akun platform, bukan akun organisasi")
	ErrNameEmailRequired     = errors.New("nama dan email wajib diisi")
	ErrInvalidEmail          = errors.New("format email tidak valid")
	ErrUserExists            = errors.New("user dengan email ini sudah ada di organisasi ini, silakan edit user tersebut")
	ErrEmailInOtherOrg       = errors.New("email ini sudah terdaftar di organisasi lain (mis. daftar sendiri via google); satu email hanya bisa dipakai satu organisasi")
	ErrEmailDeleted          = errors.New("email ini milik user yang sudah dihapus dan belum bisa dipakai lagi")
	ErrAlreadyActivated      = errors.New("user sudah mengaktifkan akun; gunakan \"lupa password\" untuk reset")
)

// platformRoleName mirrors middleware.PlatformRoleName (service must not
// import the HTTP layer).
const platformRoleName = "superadmin"
