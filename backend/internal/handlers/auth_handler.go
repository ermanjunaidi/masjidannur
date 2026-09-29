package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"backend/pkg/middleware"
	"backend/internal/repository"
	"backend/internal/service"
)

// AuthHandler handles HTTP requests for authentication.
type AuthHandler struct {
	authService *service.AuthService
	userRepo    *repository.UserRepository
	frontendURL string
	states      *oauthStateStore
}

// oauthStateStore holds valid OAuth states in memory (CSRF protection).
// Kept server-side so the round-trip works even when the callback lands on
// a different host (localhost → api domain, nginx proxy, etc.) where a
// SameSite cookie would be dropped.
type oauthStateStore struct {
	mu    sync.Mutex
	valid map[string]time.Time
}

func newOAuthStateStore() *oauthStateStore {
	return &oauthStateStore{valid: make(map[string]time.Time)}
}

func (s *oauthStateStore) put(state string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.valid[state] = time.Now().Add(10 * time.Minute)
}

func (s *oauthStateStore) consume(state string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	exp, ok := s.valid[state]
	if !ok || time.Now().After(exp) {
		delete(s.valid, state)
		return false
	}
	delete(s.valid, state)
	return true
}

// NewAuthHandler creates a new AuthHandler.
// userRepo is injected so the /me endpoint can rehydrate the user
// (including the latest role/permission snapshot) from the database
// instead of trusting the localStorage JWT — important right after
// an admin edits another user's role + still wants a consistent view.
func NewAuthHandler(authService *service.AuthService, userRepo *repository.UserRepository, frontendURL string) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		userRepo:    userRepo,
		frontendURL: frontendURL,
		states:      newOAuthStateStore(),
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

// GoogleAuth handles GET /api/auth/google (redirect to consent screen).
func (h *AuthHandler) GoogleAuth(c *fiber.Ctx) error {
	state := randomState()
	h.states.put(state)
	url, err := h.authService.GoogleAuthURL(state)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
	}
	// Cookie fallback (untuk domain yang sama).
	c.Cookie(&fiber.Cookie{
		Name:     "oauth_state",
		Value:    state,
		MaxAge:   300,
		HTTPOnly: true,
		SameSite: "Lax",
	})
	return c.Redirect(url, fiber.StatusTemporaryRedirect)
}

// GoogleCallback handles GET /api/auth/google/callback. The Google consent
// round-trip ends here: the code is exchanged for a profile and the user is
// then redirected back to the frontend with a JWT.
func (h *AuthHandler) GoogleCallback(c *fiber.Ctx) error {
	state := c.Query("state")
	code := c.Query("code")
	if code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "kode oauth kosong"})
	}
	// Validasi state: cek in-memory store dulu, fallback ke cookie.
	ok := h.states.consume(state)
	if !ok {
		cookieState := c.Cookies("oauth_state")
		if cookieState != state {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "state oauth tidak cocok"})
		}
	}
	// Pass the request context: oauth2 panics with "nil context" if given nil.
	resp, err := h.authService.HandleGoogleCallback(c.UserContext(), code)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	// Redirect back to the frontend with the token in the query string.
	redirect := fmt.Sprintf("%s/login?google_token=%s", strings.TrimRight(h.frontendURL, "/"), resp.Token)
	return c.Redirect(redirect, fiber.StatusFound)
}

// randomState returns a short random hex string for OAuth CSRF protection.
func randomState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
