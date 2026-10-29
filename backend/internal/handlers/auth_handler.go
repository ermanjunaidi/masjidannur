package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"backend/internal/repository"
	"backend/internal/service"
	"backend/pkg/middleware"
)

// AuthHandler handles HTTP requests for authentication.
type AuthHandler struct {
	authService    *service.AuthService
	userRepo       *repository.UserRepository
	frontendURL    string
	allowedOrigins []string
	baseDomain     string
	states         *oauthStateStore
}

// oauthStateStore holds valid OAuth states in memory (CSRF protection),
// each bound to the frontend origin and mode (login/register) that started
// the flow. Kept server-side
// so the round-trip works even when the callback lands on a different host
// (localhost → api domain, nginx proxy, etc.) where a SameSite cookie would
// be dropped.
type oauthStateStore struct {
	mu    sync.Mutex
	valid map[string]oauthState
}

type oauthState struct {
	origin string
	mode   string
	exp    time.Time
}

// Google flow modes: only register may create an account; both log into an
// existing one.
const (
	googleModeLogin    = "login"
	googleModeRegister = "register"
)

// parseGoogleMode defaults to login so an unknown mode never creates accounts.
func parseGoogleMode(raw string) string {
	if raw == googleModeRegister {
		return googleModeRegister
	}
	return googleModeLogin
}

func newOAuthStateStore() *oauthStateStore {
	return &oauthStateStore{valid: make(map[string]oauthState)}
}

func (s *oauthStateStore) put(state, origin, mode string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Drop expired states so repeated /google hits cannot grow the map forever.
	now := time.Now()
	for k, v := range s.valid {
		if now.After(v.exp) {
			delete(s.valid, k)
		}
	}
	s.valid[state] = oauthState{origin: origin, mode: mode, exp: now.Add(10 * time.Minute)}
}

// consume returns the origin and mode bound to state and invalidates it.
func (s *oauthStateStore) consume(state string) (origin, mode string, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, found := s.valid[state]
	delete(s.valid, state)
	if !found || time.Now().After(st.exp) {
		return "", "", false
	}
	return st.origin, st.mode, true
}

// NewAuthHandler creates a new AuthHandler.
// userRepo is injected so the /me endpoint can rehydrate the user
// (including the latest role/permission snapshot) from the database
// instead of trusting the localStorage JWT — important right after
// an admin edits another user's role + still wants a consistent view.
// allowedOrigins + baseDomain decide which frontend origins may receive the
// Google login redirect (see isAllowedOrigin).
func NewAuthHandler(authService *service.AuthService, userRepo *repository.UserRepository, frontendURL string, allowedOrigins []string, baseDomain string) *AuthHandler {
	return &AuthHandler{
		authService:    authService,
		userRepo:       userRepo,
		frontendURL:    frontendURL,
		allowedOrigins: allowedOrigins,
		baseDomain:     strings.ToLower(strings.TrimSpace(baseDomain)),
		states:         newOAuthStateStore(),
	}
}

// Register handles user registration.
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var input service.RegisterInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if input.Name == "" || input.Email == "" || input.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Name, email, and password are required",
		})
	}

	resp, err := h.authService.Register(&input)
	if err != nil {
		status := fiber.StatusConflict
		if err.Error() == "email already registered" {
			status = fiber.StatusConflict
		}
		return c.Status(status).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(resp)
}

// Login handles user login.
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var input service.LoginInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if input.Email == "" || input.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Email and password are required",
		})
	}

	resp, err := h.authService.Login(&input)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(resp)
}

// Me handles GET /api/auth/me using the JWT-injected user id. Always
// re-reads the user from the DB so frontend gets the freshest
// roles/permissions snapshot and 401s gracefully on user deletion.
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	uid, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "missing actor id",
		})
	}
	user, err := h.userRepo.FindByID(uid)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "user not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "user not found",
		})
	}
	return c.JSON(user)
}

// ChangePassword handles PUT /api/auth/password (self-service).
func (h *AuthHandler) ChangePassword(c *fiber.Ctx) error {
	var input service.ChangePasswordInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	uid, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	if err := h.authService.ChangePassword(uid, &input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "password berhasil diubah"})
}

// ForgotPassword handles POST /api/auth/forgot-password.
func (h *AuthHandler) ForgotPassword(c *fiber.Ctx) error {
	var input struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if input.Email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "email wajib diisi"})
	}
	// Always return success even when the email doesn't exist (no user enumeration).
	if err := h.authService.ForgotPassword(input.Email); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "link reset password telah dikirim jika email terdaftar"})
}

// ResetPassword handles POST /api/auth/reset-password.
func (h *AuthHandler) ResetPassword(c *fiber.Ctx) error {
	var input struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if input.Token == "" || input.NewPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "token dan password wajib diisi"})
	}
	if err := h.authService.ResetPassword(input.Token, input.NewPassword); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "password berhasil direset, silakan login"})
}

// GoogleStatus handles GET /api/auth/google/status. The frontend uses it to
// hide the Google buttons when GOOGLE_CLIENT_ID/SECRET are not set.
func (h *AuthHandler) GoogleStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"enabled": h.authService.GoogleEnabled()})
}

// GoogleAuth handles GET /api/auth/google?origin=<frontend origin>&mode=
// login|register (redirect to consent screen). The frontend passes window.location.origin so
// the redirect URI can be derived automatically — developers only need to
// set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
func (h *AuthHandler) GoogleAuth(c *fiber.Ctx) error {
	origin := h.resolveOrigin(c.Query("origin"))
	if origin == "" {
		origin = h.resolveOrigin(c.Get(fiber.HeaderReferer))
	}
	if origin == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "origin frontend tidak diizinkan"})
	}
	if !h.authService.GoogleEnabled() {
		return h.googleFail(c, origin, service.ErrGoogleNotConfigured.Error())
	}
	mode := parseGoogleMode(c.Query("mode"))
	state := randomState()
	h.states.put(state, origin, mode)
	authURL, err := h.authService.GoogleAuthURL(state, googleRedirectURL(origin))
	if err != nil {
		return h.googleFail(c, origin, err.Error())
	}
	// Cookie fallback (untuk domain yang sama, mis. setelah backend restart).
	c.Cookie(&fiber.Cookie{
		Name:     "oauth_state",
		Value:    state + "|" + mode + "|" + origin,
		MaxAge:   600,
		HTTPOnly: true,
		SameSite: "Lax",
	})
	return c.Redirect(authURL, fiber.StatusTemporaryRedirect)
}

// GoogleCallback handles GET /api/auth/google/callback. The Google consent
// round-trip ends here: the code is exchanged for a profile and the user is
// then redirected back to the frontend with a JWT (or a google_error).
func (h *AuthHandler) GoogleCallback(c *fiber.Ctx) error {
	state := c.Query("state")
	code := c.Query("code")
	c.ClearCookie("oauth_state")

	// Validasi state: cek in-memory store dulu, fallback ke cookie.
	// State kosong selalu ditolak (cookie kosong == state kosong bukan bukti).
	origin, mode, ok := "", "", false
	if state != "" {
		origin, mode, ok = h.states.consume(state)
		if !ok {
			if parts := strings.SplitN(c.Cookies("oauth_state"), "|", 3); len(parts) == 3 && parts[0] == state {
				origin, mode, ok = h.resolveOrigin(parts[2]), parseGoogleMode(parts[1]), true
			}
		}
	}
	if !ok || origin == "" {
		return h.googleFail(c, h.resolveOrigin(h.frontendURL), "sesi login google kedaluwarsa, silakan coba lagi")
	}
	if e := c.Query("error"); e != "" {
		// User menekan "Batal" di layar consent Google.
		return h.googleFail(c, origin, "login google dibatalkan")
	}
	if code == "" {
		return h.googleFail(c, origin, "kode oauth kosong")
	}
	// Pass the request context: oauth2 panics with "nil context" if given nil.
	resp, err := h.authService.HandleGoogleCallback(c.UserContext(), code, googleRedirectURL(origin), mode == googleModeRegister)
	if err != nil {
		// Unknown account on "Masuk": send them to the register page.
		if errors.Is(err, service.ErrGoogleAccountNotFound) {
			return h.googleFailOn(c, origin, "/register", err.Error())
		}
		return h.googleFail(c, origin, err.Error())
	}
	// Redirect back to the frontend with the token in the query string.
	return c.Redirect(fmt.Sprintf("%s/login?google_token=%s", origin, url.QueryEscape(resp.Token)), fiber.StatusFound)
}

// googleFail sends the browser back to the login page with a readable error
// instead of leaving it on a raw JSON response from the API.
func (h *AuthHandler) googleFail(c *fiber.Ctx, origin, msg string) error {
	return h.googleFailOn(c, origin, "/login", msg)
}

// googleFailOn is googleFail with an explicit frontend page.
func (h *AuthHandler) googleFailOn(c *fiber.Ctx, origin, page, msg string) error {
	if origin == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": msg})
	}
	return c.Redirect(fmt.Sprintf("%s%s?google_error=%s", origin, page, url.QueryEscape(msg)), fiber.StatusFound)
}

// resolveOrigin normalises raw (an origin or full URL) to scheme://host[:port]
// and returns it only when it is an allowed frontend origin; else "".
func (h *AuthHandler) resolveOrigin(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return ""
	}
	origin := u.Scheme + "://" + strings.ToLower(u.Host)
	if h.isAllowedOrigin(origin, strings.ToLower(u.Hostname())) {
		return origin
	}
	return ""
}

// isAllowedOrigin: the token is only ever redirected to a known frontend —
// FRONTEND_URL, an explicit ALLOWED_ORIGINS entry, BASE_DOMAIN (or one of its
// subdomains), or localhost for local dev.
func (h *AuthHandler) isAllowedOrigin(origin, host string) bool {
	if host == "localhost" || host == "127.0.0.1" {
		return true
	}
	if h.baseDomain != "" && (host == h.baseDomain || strings.HasSuffix(host, "."+h.baseDomain)) {
		return true
	}
	if fu, err := url.Parse(h.frontendURL); err == nil && fu.Host != "" && strings.EqualFold(fu.Scheme+"://"+fu.Host, origin) {
		return true
	}
	for _, o := range h.allowedOrigins {
		if o != "*" && strings.EqualFold(strings.TrimRight(o, "/"), origin) {
			return true
		}
	}
	return false
}

// googleRedirectURL is the callback URL registered in Google Cloud Console.
// It points at the frontend origin; Vite proxies /api to the backend, so the
// same pattern works locally and in production.
func googleRedirectURL(origin string) string {
	return origin + "/api/auth/google/callback"
}

// randomState returns a short random hex string for OAuth CSRF protection.
func randomState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
