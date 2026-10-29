package main

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"backend/config"
	"backend/internal/handlers"
	"backend/internal/models"
	"backend/internal/repository"
	"backend/internal/routes"
	"backend/internal/service"
)

var defaultPermissionCatalog = []models.Permission{
	// Dashboard
	{Key: "dashboard:read", Name: "View Dashboard"},
	// Buku Kas
	{Key: "books:read", Name: "View Cash Books"},
	{Key: "books:write", Name: "Edit Cash Books"},
	{Key: "books:delete", Name: "Delete Cash Books"},
	// Kategori
	{Key: "categories:read", Name: "View Categories"},
	{Key: "categories:write", Name: "Edit Categories"},
	{Key: "categories:delete", Name: "Delete Categories"},
	// Transaksi
	{Key: "transactions:read", Name: "View Transactions"},
	{Key: "transactions:write", Name: "Edit Transactions"},
	{Key: "transactions:delete", Name: "Delete Transactions"},
	// Laporan
	{Key: "reports:read", Name: "View Reports"},
	// Jadwal Pengajian & Khatib
	{Key: "lecturings:read", Name: "View Lecture Schedules"},
	{Key: "lecturings:write", Name: "Edit Lecture Schedules"},
	{Key: "lecturings:delete", Name: "Delete Lecture Schedules"},
	// Profil Masjid
	{Key: "settings:read", Name: "View Settings"},
	{Key: "settings:write", Name: "Edit Settings"},
	// User & role management
	{Key: "users:read", Name: "View Users"},
	{Key: "users:write", Name: "Edit Users"},
	{Key: "users:delete", Name: "Delete Users"},
	{Key: "roles:read", Name: "View Roles"},
	{Key: "roles:write", Name: "Edit Roles"},
	{Key: "roles:delete", Name: "Delete Roles"},
}

type defaultRoleBinding struct {
	Name        string
	Description string
	Keys        []string
}

// allPermissionKeys returns every key from the catalog. Used to build
// the admin and superadmin role permission sets without duplication.
func allPermissionKeys() []string {
	out := make([]string, len(defaultPermissionCatalog))
	for i, p := range defaultPermissionCatalog {
		out[i] = p.Key
	}
	return out
}

var defaultRoleBindings = []defaultRoleBinding{
	{
		Name:        "superadmin",
		Description: "Platform-level oversight: every permission across all modules.",
		Keys:        allPermissionKeys(),
	},
	{
		Name:        "admin",
		Description: "Full access to all masjid finance resources.",
		Keys:        allPermissionKeys(),
	},
	{
		Name:        "bendahara",
		Description: "Treasurer: manages books, categories, transactions, reports.",
		Keys: []string{
			"dashboard:read",
			"books:read", "books:write", "books:delete",
			"categories:read", "categories:write", "categories:delete",
			"transactions:read", "transactions:write", "transactions:delete",
			"reports:read",
			"lecturings:read", "lecturings:write", "lecturings:delete",
			"settings:read", "settings:write",
		},
	},
	{
		Name:        "user",
		Description: "Default role for new accounts. Read-only dashboard & reports.",
		Keys:        []string{"dashboard:read", "reports:read"},
	},
}

func main() {
	// ─── Config ────────────────────────────────────────────────────────────────
	env := config.NewEnv()

	// ─── Database ──────────────────────────────────────────────────────────────
	db := config.NewDatabase(env)
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get underlying sql.DB: %v", err)
	}
	defer sqlDB.Close()

	// Auto-migrate all models.
	if err := db.AutoMigrate(
		&models.User{},
		&models.Role{},
		&models.Permission{},
		&models.Organization{},
		&models.Book{},
		&models.Category{},
		&models.Transaction{},
		&models.MasjidSettings{},
		&models.PasswordResetToken{},
		&models.Lecturing{},
	); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	// ─── Repositories ─────────────────────────────────────────────────────────
	userRepo := repository.NewUserRepository(db)
	roleRepo := repository.NewRoleRepository(db)
	permissionRepo := repository.NewPermissionRepository(db)
	bookRepo := repository.NewBookRepository(db)
	categoryRepo := repository.NewCategoryRepository(db)
	transactionRepo := repository.NewTransactionRepository(db)
	settingsRepo := repository.NewMasjidSettingsRepository(db)
	lecturingRepo := repository.NewLecturingRepository(db)

	if err := bootstrapRBAC(permissionRepo, roleRepo); err != nil {
		log.Fatalf("Failed to bootstrap RBAC: %v", err)
	}

	if err := seedDevelopmentUsers(db, userRepo, roleRepo, env.AppEnv == "production"); err != nil {
		log.Fatalf("Failed to seed default users: %v", err)
	}

	// Seed a default cash book so a fresh install has somewhere to post
	// transactions immediately (mirrors MASJID_DEFAULT_BOOK_ID=1).
	if err := seedDefaultBook(db); err != nil {
		log.Fatalf("Failed to seed default book: %v", err)
	}

	// ─── Services ─────────────────────────────────────────────────────────────
	authService := service.NewAuthService(
		userRepo,
		roleRepo,
		env.JWTSecret,
		db,
		env.GoogleClientID,
		env.GoogleClientSecret,
		env.GoogleRedirectURL,
		service.SMTPConfig{Host: env.SMTPHost, Port: env.SMTPPort, User: env.SMTPUser, Password: env.SMTPPassword, From: env.SMTPFrom},
		env.FrontendURL,
	)
	userService := service.NewUserService(userRepo, roleRepo)
	roleService := service.NewRoleService(roleRepo, permissionRepo)
	bookService := service.NewBookService(bookRepo)
	categoryService := service.NewCategoryService(categoryRepo, bookRepo)
	transactionService := service.NewTransactionService(transactionRepo, categoryRepo, bookRepo)
	settingsService := service.NewMasjidSettingsService(settingsRepo)
	lecturingService := service.NewLecturingService(lecturingRepo)

	// ─── Handlers ─────────────────────────────────────────────────────────────
	authHandler := handlers.NewAuthHandler(authService, userRepo, env.FrontendURL)
	userHandler := handlers.NewUserHandler(userService)
	roleHandler := handlers.NewRoleHandler(roleService, permissionRepo)
	bookHandler := handlers.NewBookHandler(bookService)
	categoryHandler := handlers.NewCategoryHandler(categoryService)
	transactionHandler := handlers.NewTransactionHandler(transactionService)
	settingsHandler := handlers.NewMasjidSettingsHandler(settingsService)
	lecturingHandler := handlers.NewLecturingHandler(lecturingService)
	publicDisplayHandler := handlers.NewPublicDisplayHandler(settingsService, transactionService, lecturingService, bookService)

	// ─── Fiber App ─────────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:      "Buku Masjid API",
		ServerHeader: "BukuMasjid",
	})

	app.Use(recover.New())
	app.Use(logger.New())
	// Security headers (nosniff, frame-deny, referrer-policy, ...).
	app.Use(helmet.New(helmet.Config{CrossOriginResourcePolicy: "cross-origin"}))

	// Brute-force guard for the unauthenticated auth endpoints
	// (login, register, forgot/reset password).
	app.Use([]string{"/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password"}, limiter.New(limiter.Config{
		Max:          10,
		Expiration:   time.Minute,
		KeyGenerator: clientIP,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "terlalu banyak percobaan, coba lagi dalam 1 menit",
			})
		},
	}))

	// ─── CORS ──────────────────────────────────────────────────────────────────
	allowedOriginValue := "*"
	switch {
	case len(env.AllowedOrigins) > 0:
		allowedOriginValue = strings.Join(env.AllowedOrigins, ",")
		log.Printf("[cors] Allowed origins: %s", allowedOriginValue)
	case env.AppEnv == "production":
		log.Printf("[cors] WARN: ALLOWED_ORIGINS empty in production — cross-origin browser calls WILL be rejected.")
		allowedOriginValue = ""
	default:
		log.Printf("[cors] ALLOWED_ORIGINS not set (dev mode) — using * wildcard.")
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOriginValue,
		AllowMethods:     "GET,POST,HEAD,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Requested-With",
		AllowCredentials: false,
		ExposeHeaders:    "Content-Length",
		MaxAge:           600,
	}))

	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message": "Buku Masjid API",
			"env":     env.AppEnv,
		})
	})

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "db": "connected"})
	})

	routes.SetupRoutes(
		app,
		authHandler,
		userHandler,
		roleHandler,
		bookHandler,
		categoryHandler,
		transactionHandler,
		settingsHandler,
		lecturingHandler,
		publicDisplayHandler,
		env.JWTSecret,
	)

	addr := fmt.Sprintf(":%s", env.AppPort)
	log.Printf("[server] Starting on %s (env=%s)", addr, env.AppEnv)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("[server] Failed to start: %v", err)
	}
}

// clientIP returns the real client IP behind Cloudflare → Traefik. The
// backend is only reachable through that chain, so the forwarded headers
// are set by trusted proxies.
func clientIP(c *fiber.Ctx) string {
	if ip := c.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if xff := c.Get(fiber.HeaderXForwardedFor); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	return c.IP()
}

// seedDefaultBook creates the "Kas Umum" book (org 0) on first run so a
// fresh install can immediately record transactions. Find-or-create by
// name within org 0 keeps restarts idempotent.
func seedDefaultBook(db *gorm.DB) error {
	var count int64
	if err := db.Model(&models.Book{}).Where("organization_id = 0").Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	book := &models.Book{
		OrganizationID: 0,
		Name:           "Kas Umum",
		Description:    "Buku kas utama masjid",
		IsActive:       true,
	}
	return db.Create(book).Error
}

func bootstrapRBAC(
	permissionRepo *repository.PermissionRepository,
	roleRepo *repository.RoleRepository,
) error {
	for i := range defaultPermissionCatalog {
		seed := &defaultPermissionCatalog[i]
		existing, err := permissionRepo.FindByKey(seed.Key)
		if err != nil {
			return err
		}
		if existing != nil {
			continue
		}
		if err := permissionRepo.Create(seed); err != nil {
			return err
		}
	}

	perms, err := permissionRepo.FindAll()
	if err != nil {
		return err
	}
	permsByKey := make(map[string]uint, len(perms))
	for _, p := range perms {
		permsByKey[p.Key] = p.ID
	}

	for _, binding := range defaultRoleBindings {
		existing, err := roleRepo.FindByName(binding.Name)
		if err != nil {
			return err
		}
		ids := make([]uint, 0, len(binding.Keys))
		for _, key := range binding.Keys {
			id, ok := permsByKey[key]
			if !ok {
				return fmt.Errorf("bootstrapRBAC: missing seed permission %q", key)
			}
			ids = append(ids, id)
		}
		if existing != nil {
			// Role already present — make sure it carries any permissions
			// added to the catalog since it was first created, without
			// stripping admin customizations.
			if err := roleRepo.EnsurePermissions(existing.ID, ids); err != nil {
				return err
			}
			continue
		}
		if _, err := roleRepo.Create(&models.Role{
			Name:        binding.Name,
			Description: binding.Description,
		}, ids); err != nil {
			return err
		}
	}
	return nil
}

// seedDevelopmentUsers keeps the demo accounts in sync on every boot.
//
// In production the well-known default passwords would hand anyone the
// superadmin account, so there an account is only created when its
// SEED_*_PASSWORD env var is set, and existing accounts are never touched
// (no password reset on restart).
func seedDevelopmentUsers(db *gorm.DB, userRepo *repository.UserRepository, roleRepo *repository.RoleRepository, production bool) error {
	seedPassword := func(envKey, devDefault string) string {
		if v := os.Getenv(envKey); v != "" {
			return v
		}
		if production {
			return ""
		}
		return devDefault
	}

	users := []struct {
		Name     string
		Email    string
		Password string
		RoleName string
	}{
		{Name: "Super Admin", Email: "superadmin@example.com", Password: seedPassword("SEED_SUPERADMIN_PASSWORD", "superadmin123"), RoleName: "superadmin"},
		{Name: "Admin Masjid", Email: "admin@example.com", Password: seedPassword("SEED_ADMIN_PASSWORD", "admin123"), RoleName: "admin"},
		{Name: "Bendahara", Email: "bendahara@example.com", Password: seedPassword("SEED_BENDAHARA_PASSWORD", "bendahara123"), RoleName: "bendahara"},
		{Name: "Demo User", Email: "user@example.com", Password: seedPassword("SEED_USER_PASSWORD", "user123"), RoleName: "user"},
	}

	// Non-superadmin seed users belong to a demo organization so tenant
	// isolation holds for the fixtures too. Find-or-create so restarts
	// don't orphan previous demo orgs.
	demoOrg := &models.Organization{Name: "Masjid Demo"}
	if err := db.Where("name = ?", demoOrg.Name).FirstOrCreate(demoOrg).Error; err != nil {
		return err
	}

	for _, seed := range users {
		if seed.Password == "" {
			continue
		}
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(seed.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		role, err := roleRepo.FindByName(seed.RoleName)
		if err != nil {
			return err
		}
		if role == nil {
			return fmt.Errorf("seed role %q not found in catalog", seed.RoleName)
		}
		roleIDs := []uint{role.ID}

		orgID := demoOrg.ID
		if seed.RoleName == "superadmin" {
			orgID = 0
		}

		user, err := userRepo.FindByEmail(seed.Email)
		if err != nil {
			return err
		}

		if user == nil {
			if err := userRepo.CreateWithRoles(&models.User{
				Name:           seed.Name,
				Email:          seed.Email,
				Password:       string(hashedPassword),
				IsActive:       true,
				OrganizationID: orgID,
			}, roleIDs); err != nil {
				return err
			}
			continue
		}

		if production {
			continue
		}
		user.Name = seed.Name
		user.Password = string(hashedPassword)
		user.IsActive = true
		user.OrganizationID = orgID
		if err := userRepo.UpdateWithRoles(user, roleIDs); err != nil {
			return err
		}
	}
	return nil
}
