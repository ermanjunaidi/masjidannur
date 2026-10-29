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
	userRepo    *repository.UserRepository
	roleRepo    *repository.RoleRepository
	jwtSecret   string
	db          *gorm.DB
	googleOAuth *oauth2.Config
	smtp        SMTPConfig
	frontendURL string
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
	// Cukup CLIENT_ID + CLIENT_SECRET. RedirectURL opsional: kalau kosong,
	// handler menurunkannya per-request dari origin frontend
	// (<origin>/api/auth/google/callback, lewat Vite proxy).
	if googleClientID != "" && googleClientSecret != "" {
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
	if len(input.NewPassword) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	user, err := s.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}
	if user.NoPassword {
		return ErrNoPasswordYet
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
	input.Email = NormalizeEmail(input.Email)
	if len(input.Password) < MinPasswordLength {
		return nil, ErrPasswordTooShort
	}
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

	token, err := s.issueSetPasswordToken(user.ID, time.Hour)
	if err != nil {
		return err
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

// inviteTTL is how long an admin invite link stays valid.
const inviteTTL = 7 * 24 * time.Hour

// issueSetPasswordToken stores a one-time token that lets the email owner
// set a password via /reset-password (forgot password and invites).
func (s *AuthService) issueSetPasswordToken(userID uint, ttl time.Duration) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", errors.New("failed to generate reset token")
	}
	token := hex.EncodeToString(tokenBytes)
	record := models.PasswordResetToken{
		UserID:    userID,
		Token:     token,
		ExpiresAt: time.Now().Add(ttl),
	}
	if err := s.db.Create(&record).Error; err != nil {
		return "", errors.New("failed to save reset token")
	}
	return token, nil
}

// SendInvite emails an admin-created user a link to set their password
// (or they can simply sign in with Google using the same email). The
// admin never chooses or sees the password. When SMTP is not configured
// the link is returned with emailed=false so the admin can share it.
func (s *AuthService) SendInvite(user *models.User) (link string, emailed bool, err error) {
	token, err := s.issueSetPasswordToken(user.ID, inviteTTL)
	if err != nil {
		return "", false, err
	}
	link = fmt.Sprintf("%s/reset-password?token=%s&invite=1", strings.TrimRight(s.frontendURL, "/"), token)

	orgName := "MasjidHub"
	var org models.Organization
	if user.OrganizationID != 0 && s.db.First(&org, user.OrganizationID).Error == nil && org.Name != "" {
		orgName = org.Name
	}
	if s.smtp.Host == "" {
		log.Printf("[auth] INVITE LINK untuk %s (SMTP belum dikonfigurasi): %s", user.Email, link)
		return link, false, nil
	}
	body := fmt.Sprintf(
		"Halo %s,\n\nAnda ditambahkan ke %s.\n\nAktifkan akun dengan membuat password (link berlaku 7 hari):\n%s\n\nAtau langsung pilih \"Masuk dengan Google\" memakai email ini (%s).",
		user.Name, orgName, link, user.Email,
	)
	if err := s.sendEmail(user.Email, "Undangan — "+orgName, body); err != nil {
		log.Printf("[auth] kirim undangan ke %s gagal: %v", user.Email, err)
		return link, false, nil
	}
	return "", true, nil
}

// ResetPassword validates a reset token and updates the user's password.
func (s *AuthService) ResetPassword(token, newPassword string) error {
	if len(newPassword) < MinPasswordLength {
		return ErrPasswordTooShort
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
	// Claim the token atomically first so two concurrent requests cannot
	// both redeem it.
	claim := s.db.Model(&models.PasswordResetToken{}).
		Where("id = ? AND used = false", record.ID).
		Update("used", true)
	if claim.Error != nil {
		return claim.Error
	}
	if claim.RowsAffected == 0 {
		return errors.New("token reset tidak valid atau sudah kedaluwarsa")
	}
	if err := s.userRepo.UpdatePassword(user.ID, string(hashed)); err != nil {
		return errors.New("failed to update password")
	}
	return nil
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

// ErrGoogleNotConfigured is returned when GOOGLE_CLIENT_ID/SECRET are unset.
var ErrGoogleNotConfigured = errors.New("login google belum dikonfigurasi")

// ErrGoogleAccountNotFound: "Masuk dengan Google" for an unregistered email.
var ErrGoogleAccountNotFound = errors.New("akun google ini belum terdaftar, silakan daftar terlebih dahulu")

// ErrGoogleAccountConflict: the email is already linked to a different
// Google account (e.g. the address was reassigned in Google Workspace).
var ErrGoogleAccountConflict = errors.New("email ini sudah terhubung ke akun google lain")

// ErrNoPasswordYet: Google-only / invited accounts have no password to
// verify; they create one through the emailed link instead.
var ErrNoPasswordYet = errors.New("akun ini belum punya password (masuk via google / undangan); gunakan \"lupa password\" untuk membuatnya")

// GoogleEnabled reports whether GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
func (s *AuthService) GoogleEnabled() bool { return s.googleOAuth != nil }

// GoogleFixedRedirectURL returns GOOGLE_REDIRECT_URL (empty = derive per request).
func (s *AuthService) GoogleFixedRedirectURL() string {
	if s.googleOAuth == nil {
		return ""
	}
	return s.googleOAuth.RedirectURL
}

// googleConfig returns a copy of the OAuth config bound to redirectURL. The
// same redirectURL MUST be used for the consent URL and the code exchange.
func (s *AuthService) googleConfig(redirectURL string) *oauth2.Config {
	cfg := *s.googleOAuth
	if cfg.RedirectURL == "" {
		cfg.RedirectURL = redirectURL
	}
	return &cfg
}

// GoogleAuthURL returns the Google consent URL (state = CSRF token). Returns
// an error when Google OAuth is not configured.
func (s *AuthService) GoogleAuthURL(state, redirectURL string) (string, error) {
	if s.googleOAuth == nil {
		return "", ErrGoogleNotConfigured
	}
	return s.googleConfig(redirectURL).AuthCodeURL(state, oauth2.SetAuthURLParam("prompt", "select_account")), nil
}

// HandleGoogleCallback exchanges the code for a Google profile and logs in
// the matching user. An unknown email gets a new workspace account (SaaS
// model: the signup becomes its admin) only when register is true, so
// "Masuk dengan Google" never creates accounts by accident.
//
// ctx MUST be non-nil: golang.org/x/oauth2 ends up calling
// (*http.Request).WithContext, which panics with "nil context" when handed
// a nil parent (this is what broke the Google signup flow previously), and
// Config.Client also needs it to attach cancellation to the profile call.
func (s *AuthService) HandleGoogleCallback(ctx context.Context, code, redirectURL string, register bool) (*AuthResponse, error) {
	if s.googleOAuth == nil {
		return nil, ErrGoogleNotConfigured
	}
	if ctx == nil {
		ctx = context.Background()
	}
	cfg := s.googleConfig(redirectURL)
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		log.Printf("[auth] google token exchange gagal: %v", err)
		return nil, errors.New("google token exchange gagal")
	}

	client := cfg.Client(ctx, tok)
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
	if info.Email == "" || info.ID == "" {
		return nil, errors.New("akun google tidak memiliki email")
	}
	// Email belum terverifikasi tidak boleh dipakai: login by email bisa
	// mengambil alih akun lokal dengan email yang sama.
	if !info.VerifiedEmail {
		return nil, errors.New("email google belum terverifikasi")
	}

	user, err := s.findOrLinkGoogleUser(info.ID, info.Email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		if !register {
			return nil, ErrGoogleAccountNotFound
		}
		user, err = s.createGoogleUser(info.Name, NormalizeEmail(info.Email), info.ID)
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

// findOrLinkGoogleUser resolves a Google profile to an existing account:
// first by Google "sub", then by (verified) email. A match by email — e.g.
// a user an admin invited, or one who registered with a password — gets
// the Google ID linked, so both sign-in methods reach the same account
// instead of creating a duplicate. Returns nil when no account matches.
func (s *AuthService) findOrLinkGoogleUser(googleID, email string) (*models.User, error) {
	user, err := s.userRepo.FindByGoogleID(googleID)
	if err != nil || user != nil {
		return user, err
	}
	user, err = s.userRepo.FindByEmail(email)
	if err != nil || user == nil {
		return user, err
	}
	if user.GoogleID != nil {
		if *user.GoogleID != googleID {
			return nil, ErrGoogleAccountConflict
		}
		return user, nil
	}
	if err := s.userRepo.LinkGoogle(user.ID, googleID); err != nil {
		return nil, errors.New("gagal menghubungkan akun google")
	}
	user.GoogleID = &googleID
	return user, nil
}

// UnusablePasswordHash hashes random bytes nobody knows, for accounts that
// must not log in with a password until the owner sets one by email.
func UnusablePasswordHash() (string, error) {
	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		return "", errors.New("failed to generate password")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(hex.EncodeToString(randBytes)), bcrypt.DefaultCost)
	if err != nil {
		return "", errors.New("failed to hash password")
	}
	return string(hashed), nil
}

// NormalizeEmail trims and lowercases an email so one address maps to one
// account regardless of how it was typed.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// createGoogleUser registers a new masjid admin for a Google signup.
func (s *AuthService) createGoogleUser(name, email, googleID string) (*models.User, error) {
	adminRole, err := s.roleRepo.FindByName(DefaultRoleName)
	if err != nil {
		return nil, errors.New("default role lookup failed")
	}
	org := &models.Organization{Name: name}
	if err := s.db.Create(org).Error; err != nil {
		return nil, errors.New("failed to create organization")
	}
	// Google signups get a random unusable password (OAuth login only).
	hashed, err := UnusablePasswordHash()
	if err != nil {
		return nil, err
	}

	user := &models.User{
		Name:           name,
		Email:          email,
		Password:       hashed,
		NoPassword:     true,
		GoogleID:       &googleID,
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
