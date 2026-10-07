package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
	jwtpkg "backend/pkg/jwt"
)

// DefaultRoleName is the role new users get on Register. In the SaaS
// model every signup becomes the admin of their own masjid/workspace,
// so new accounts receive the `admin` role (not `user`). Platform-level
// oversight belongs to the separate `superadmin` role.
const DefaultRoleName = "admin"

// SMTPConfig carries optional email-sending settings for the
// forgot-password flow. When Host is empty, reset links are logged to
// stdout instead (development fallback).
type SMTPConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	From     string
}

// AuthService handles authentication business logic.
type AuthService struct {
	userRepo     *repository.UserRepository
	roleRepo     *repository.RoleRepository
	jwtSecret    string
	db           *gorm.DB
	googleOAuth  *oauth2.Config
	smtp         SMTPConfig
	frontendURL  string
}

// NewAuthService creates a new AuthService.
func NewAuthService(
	userRepo *repository.UserRepository,
	roleRepo *repository.RoleRepository,
	jwtSecret string,
	db *gorm.DB,
	googleClientID, googleClientSecret, googleRedirectURL string,
	smtp SMTPConfig,
	frontendURL string,
) *AuthService {
	svc := &AuthService{
		userRepo:    userRepo,
		roleRepo:    roleRepo,
		jwtSecret:   jwtSecret,
		db:          db,
		smtp:        smtp,
		frontendURL: frontendURL,
	}
	if googleClientID != "" && googleClientSecret != "" && googleRedirectURL != "" {
		svc.googleOAuth = &oauth2.Config{
			ClientID:     googleClientID,
			ClientSecret: googleClientSecret,
			RedirectURL:  googleRedirectURL,
			Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
			Endpoint:     google.Endpoint,
		}
	}
	return svc
}

// RegisterInput represents the expected payload for registration.
type RegisterInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginInput represents the expected payload for login.
type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse is returned after successful authentication. `User` carries
// the eager-loaded roles; the JWT carries the permission snapshot.
type AuthResponse struct {
	Token string       `json:"token"`
	User  *models.User `json:"user"`
}

// ChangePasswordInput is the payload for the Security page: verify the
// current password and set a new one.
type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword verifies the current password and replaces it with a new
// hash for the given user (self-service, any authenticated user).
func (s *AuthService) ChangePassword(userID uint, input *ChangePasswordInput) error {
	if input.CurrentPassword == "" || input.NewPassword == "" {
		return errors.New("password saat ini dan password baru wajib diisi")
	}
	if len(input.NewPassword) < 6 {
		return errors.New("password baru minimal 6 karakter")
	}
	user, err := s.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.CurrentPassword)); err != nil {
		return errors.New("password saat ini salah")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash password")
	}
	return s.userRepo.UpdatePassword(userID, string(hashed))
}

// Register creates a new masjid organization plus an admin account that
// owns it, and returns a JWT with the freshly flattened permission set.
func (s *AuthService) Register(input *RegisterInput) (*AuthResponse, error) {
	existing, _ := s.userRepo.FindByEmail(input.Email)
	if existing != nil {
		return nil, errors.New("email already registered")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("failed to hash password")
	}

	adminRole, err := s.roleRepo.FindByName(DefaultRoleName)
	if err != nil {
		return nil, errors.New("default role lookup failed")
	}

	// SaaS model: each signup gets its own organization (tenant). The
	// registering user becomes the admin of that fresh workspace.
	org := &models.Organization{Name: input.Name}
	if err := s.db.Create(org).Error; err != nil {
		return nil, errors.New("failed to create organization")
	}

	user := &models.User{
		Name:           input.Name,
		Email:          input.Email,
		Password:       string(hashedPassword),
		IsActive:       true,
		OrganizationID: org.ID,
	}
	var roleIDs []uint
	if adminRole != nil {
		roleIDs = []uint{adminRole.ID}
	}
	if err := s.userRepo.CreateWithRoles(user, roleIDs); err != nil {
		return nil, errors.New("failed to create user")
	}

	s.provisionTenantWorkspace(org.ID, org.Name, user.ID)

	full, err := s.userRepo.FindByID(user.ID)
	if err != nil || full == nil {
		return nil, errors.New("failed to load created user")
	}

	token, err := jwtpkg.GenerateToken(full.ID, full.OrganizationID, full.BranchID, full.RoleNames(), full.PermissionKeys(), s.jwtSecret)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}
	return &AuthResponse{Token: token, User: full}, nil
}

// Login authenticates a user and returns a JWT token + the user record.
func (s *AuthService) Login(input *LoginInput) (*AuthResponse, error) {
	user, err := s.userRepo.FindByEmail(input.Email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid email or password")
		}
		return nil, err
	}
	if user == nil {
		return nil, errors.New("invalid email or password")
	}
	if !user.IsActive {
		return nil, errors.New("account is inactive")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		return nil, errors.New("invalid email or password")
	}

	token, err := jwtpkg.GenerateToken(user.ID, user.OrganizationID, user.BranchID, user.RoleNames(), user.PermissionKeys(), s.jwtSecret)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}
	return &AuthResponse{Token: token, User: user}, nil
}

// ─── Forgot / reset password ──────────────────────────────────────────────────

// ForgotPassword generates a one-time reset token for the given email and
// delivers it (email when SMTP is configured, otherwise logged to stdout).
func (s *AuthService) ForgotPassword(email string) error {
	user, err := s.userRepo.FindByEmail(email)
	if err != nil {
		return err
	}
	// Never reveal whether an email exists — same response either way.
	if user == nil {
		return nil
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return errors.New("failed to generate reset token")
	}
	token := hex.EncodeToString(tokenBytes)

	record := models.PasswordResetToken{
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := s.db.Create(&record).Error; err != nil {
		return errors.New("failed to save reset token")
	}

	link := fmt.Sprintf("%s/reset-password?token=%s", strings.TrimRight(s.frontendURL, "/"), token)
	if s.smtp.Host != "" {
		if err := s.sendEmail(user.Email, "Reset Password — MasjidHub", fmt.Sprintf(
			"Halo %s,\n\nKlik link berikut untuk mereset password Anda (berlaku 1 jam):\n%s\n\nJika tidak meminta reset, abaikan email ini.", user.Name, link,
		)); err != nil {
			return errors.New("failed to send reset email")
		}
		return nil
	}
	log.Printf("[auth] RESET LINK (SMTP belum dikonfigurasi): %s", link)
	return nil
}

// ResetPassword validates a reset token and updates the user's password.
func (s *AuthService) ResetPassword(token, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("password minimal 6 karakter")
	}
	var record models.PasswordResetToken
	if err := s.db.Where("token = ? AND used = false AND expires_at > ?", token, time.Now()).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("token reset tidak valid atau sudah kedaluwarsa")
		}
		return err
	}

	user, err := s.userRepo.FindByID(record.UserID)
	if err != nil || user == nil {
		return errors.New("user tidak ditemukan")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash password")
	}
	if err := s.db.Model(user).Update("password", string(hashed)).Error; err != nil {
		return errors.New("failed to update password")
	}
	return s.db.Model(&record).Update("used", true).Error
}

// sendEmail sends a plain-text email via the configured SMTP server.
func (s *AuthService) sendEmail(to, subject, body string) error {
	addr := fmt.Sprintf("%s:%s", s.smtp.Host, s.smtp.Port)
	msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", s.smtp.From, to, subject, body))
	var auth smtp.Auth
	if s.smtp.User != "" {
		auth = smtp.PlainAuth("", s.smtp.User, s.smtp.Password, s.smtp.Host)
	}
	return smtp.SendMail(addr, auth, s.smtp.From, []string{to}, msg)
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

// GoogleAuthURL returns the Google consent URL (state = CSRF token). Returns
// an error when Google OAuth is not configured.
func (s *AuthService) GoogleAuthURL(state string) (string, error) {
	if s.googleOAuth == nil {
		return "", errors.New("google oauth tidak dikonfigurasi")
	}
	return s.googleOAuth.AuthCodeURL(state, oauth2.AccessTypeOffline), nil
}

// HandleGoogleCallback exchanges the code for a Google profile, then logs
// in or registers the matching user (SaaS model: new emails become admin).
//
// ctx MUST be non-nil: golang.org/x/oauth2 ends up calling
// (*http.Request).WithContext, which panics with "nil context" when handed
// a nil parent (this is what broke the Google signup flow previously), and
// Config.Client also needs it to attach cancellation to the profile call.
func (s *AuthService) HandleGoogleCallback(ctx context.Context, code string) (*AuthResponse, error) {
	if s.googleOAuth == nil {
		return nil, errors.New("google oauth tidak dikonfigurasi")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	tok, err := s.googleOAuth.Exchange(ctx, code)
	if err != nil {
		log.Printf("[auth] google token exchange gagal: %v", err)
		return nil, errors.New("google token exchange gagal")
	}

	client := s.googleOAuth.Client(ctx, tok)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, errors.New("gagal mengambil profil google")
	}
	defer resp.Body.Close()

	var info struct {
		ID            string `json:"id"`
		Email         string `json:"email"`
		Name          string `json:"name"`
		VerifiedEmail bool   `json:"verified_email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, errors.New("gagal membaca profil google")
	}
	if info.Email == "" {
		return nil, errors.New("akun google tidak memiliki email")
	}

	user, err := s.userRepo.FindByEmail(info.Email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		user, err = s.createGoogleUser(info.Name, info.Email)
		if err != nil {
			return nil, err
		}
	}
	if !user.IsActive {
		return nil, errors.New("akun nonaktif")
	}

	full, err := s.userRepo.FindByID(user.ID)
	if err != nil || full == nil {
		return nil, errors.New("failed to load user")
	}
	token, err := jwtpkg.GenerateToken(full.ID, full.OrganizationID, full.BranchID, full.RoleNames(), full.PermissionKeys(), s.jwtSecret)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}
	return &AuthResponse{Token: token, User: full}, nil
}

// createGoogleUser registers a new masjid admin for a Google signup.
func (s *AuthService) createGoogleUser(name, email string) (*models.User, error) {
	adminRole, err := s.roleRepo.FindByName(DefaultRoleName)
	if err != nil {
		return nil, errors.New("default role lookup failed")
	}
	org := &models.Organization{Name: name}
	if err := s.db.Create(org).Error; err != nil {
		return nil, errors.New("failed to create organization")
	}
	// Google signups get a random unusable password (OAuth login only).
	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		return nil, errors.New("failed to generate password")
	}
	hashed, _ := bcrypt.GenerateFromPassword([]byte(hex.EncodeToString(randBytes)), bcrypt.DefaultCost)

	user := &models.User{
		Name:           name,
		Email:          email,
		Password:       string(hashed),
		IsActive:       true,
		OrganizationID: org.ID,
	}
	var roleIDs []uint
	if adminRole != nil {
		roleIDs = []uint{adminRole.ID}
	}
	if err := s.userRepo.CreateWithRoles(user, roleIDs); err != nil {
		return nil, errors.New("failed to create user")
	}
	s.provisionTenantWorkspace(org.ID, org.Name, user.ID)
	return user, nil
}

// provisionTenantWorkspace bootstraps default masjid settings and primary cash book for a new tenant.
func (s *AuthService) provisionTenantWorkspace(orgID uint, orgName string, userID uint) {
	baseSlug := repository.Slugify(orgName)
	slug := baseSlug
	var count int64
	s.db.Model(&models.MasjidSettings{}).Where("slug = ?", slug).Count(&count)
	if count > 0 {
		slug = fmt.Sprintf("%s-%d", baseSlug, orgID)
	}
	masjidName := strings.TrimSpace(orgName)
	if !strings.HasPrefix(strings.ToLower(masjidName), "masjid") {
		masjidName = "Masjid " + masjidName
	}
	settings := &models.MasjidSettings{
		OrganizationID: orgID,
		Slug:           slug,
		Name:           masjidName,
		CurrencyCode:   "Rp",
		CityName:       "Jakarta",
		Latitude:       -6.2088,
		Longitude:      106.8456,
		UpdatedBy:      userID,
	}
	_ = s.db.Create(settings).Error

	book := &models.Book{
		OrganizationID: orgID,
		BranchID:       0,
		Name:           "Kas Utama",
		Description:    "Buku kas operasional utama masjid",
		IsActive:       true,
	}
	_ = s.db.Create(book).Error
}
