package routes

import (
	"github.com/gofiber/fiber/v2"

	"backend/internal/handlers"
	"backend/pkg/middleware"
)

// SetupRoutes registers all API routes.
//
// Permission layout (Buku Masjid):
//
//	/api/auth/*             — public + auth-protected (PostLogin reads JWT)
//	/api/books/*            — gated by `books:*`
//	/api/categories/*       — gated by `categories:*`
//	/api/transactions/*     — gated by `transactions:*`
//	/api/reports/*          — gated by `reports:read`
//	/api/lecturings/*       — gated by `lecturings:*`
//	/api/masjid-settings    — gated by `settings:*`
//	/api/users/*            — gated per-endpoint by `users:*` permissions
//	/api/roles/*            — gated per-endpoint by `roles:*`; writes are platform-admin only
func SetupRoutes(
	app *fiber.App,
	authHandler *handlers.AuthHandler,
	userHandler *handlers.UserHandler,
	roleHandler *handlers.RoleHandler,
	bookHandler *handlers.BookHandler,
	categoryHandler *handlers.CategoryHandler,
	transactionHandler *handlers.TransactionHandler,
	masjidSettingsHandler *handlers.MasjidSettingsHandler,
	lecturingHandler *handlers.LecturingHandler,
	publicDisplayHandler *handlers.PublicDisplayHandler,
	jwtSecret string,
) {
	api := app.Group("/api")

	resolver := func() string { return jwtSecret }

	// ─── Public Display (Layar TV Masjid) ─────────────────────────────
	api.Get("/public/display", publicDisplayHandler.GetDisplayData)
	api.Get("/public/display/:slug", publicDisplayHandler.GetDisplayData)

	// Public auth endpoints (register, login, reset, google). No RequireAuth.
	auth := api.Group("/auth")
	auth.Post("/register", authHandler.Register)
	auth.Post("/login", authHandler.Login)
	auth.Post("/forgot-password", authHandler.ForgotPassword)
	auth.Post("/reset-password", authHandler.ResetPassword)
	auth.Get("/google", authHandler.GoogleAuth)
	auth.Get("/google/callback", authHandler.GoogleCallback)

	// Protected auth endpoints (me, change-password). JWT required.
	authProtected := auth.Group("", middleware.RequireAuth(resolver))
	authProtected.Get("/me", authHandler.Me)
	authProtected.Put("/password", authHandler.ChangePassword)

	// ─── Buku Kas (cash books) ────────────────────────────────────────
	books := api.Group("/books", middleware.RequireAuth(resolver))
	books.Get("/", middleware.RequirePermission("books:read"), bookHandler.ListBooks)
	books.Post("/", middleware.RequirePermission("books:write"), bookHandler.CreateBook)
	books.Get("/:id", middleware.RequirePermission("books:read"), bookHandler.GetBook)
	books.Put("/:id", middleware.RequirePermission("books:write"), bookHandler.UpdateBook)
	books.Delete("/:id", middleware.RequirePermission("books:delete"), bookHandler.DeleteBook)

	// ─── Kategori (income/expense categories) ─────────────────────────
	categories := api.Group("/categories", middleware.RequireAuth(resolver))
	categories.Get("/", middleware.RequirePermission("categories:read"), categoryHandler.ListCategories)
	categories.Post("/", middleware.RequirePermission("categories:write"), categoryHandler.CreateCategory)
	categories.Put("/:id", middleware.RequirePermission("categories:write"), categoryHandler.UpdateCategory)
	categories.Delete("/:id", middleware.RequirePermission("categories:delete"), categoryHandler.DeleteCategory)

	// ─── Transaksi (pemasukan / pengeluaran) ──────────────────────────
	txs := api.Group("/transactions", middleware.RequireAuth(resolver))
	txs.Get("/", middleware.RequirePermission("transactions:read"), transactionHandler.ListTransactions)
	txs.Post("/", middleware.RequirePermission("transactions:write"), transactionHandler.CreateTransaction)
	txs.Put("/:id", middleware.RequirePermission("transactions:write"), transactionHandler.UpdateTransaction)
	txs.Delete("/:id", middleware.RequirePermission("transactions:delete"), transactionHandler.DeleteTransaction)

	// ─── Laporan (monthly / category / weekly) ────────────────────────
	reports := api.Group("/reports", middleware.RequireAuth(resolver))
	reports.Get("/monthly", middleware.RequirePermission("reports:read"), transactionHandler.MonthlyReport)
	reports.Get("/category", middleware.RequirePermission("reports:read"), transactionHandler.CategoryReport)
	reports.Get("/weekly", middleware.RequirePermission("reports:read"), transactionHandler.WeeklyReport)

	// ─── Jadwal Pengajian & Khatib ─────────────────────────────────
	lecturings := api.Group("/lecturings", middleware.RequireAuth(resolver))
	lecturings.Get("/", middleware.RequirePermission("lecturings:read"), lecturingHandler.ListLecturings)
	lecturings.Post("/", middleware.RequirePermission("lecturings:write"), lecturingHandler.CreateLecturing)
	lecturings.Put("/:id", middleware.RequirePermission("lecturings:write"), lecturingHandler.UpdateLecturing)
	lecturings.Delete("/:id", middleware.RequirePermission("lecturings:delete"), lecturingHandler.DeleteLecturing)

	// ─── Profil Masjid (settings) ─────────────────────────────────────
	settings := api.Group("/masjid-settings", middleware.RequireAuth(resolver))
	settings.Get("/", middleware.RequirePermission("settings:read"), masjidSettingsHandler.GetSettings)
	settings.Put("/", middleware.RequirePermission("settings:write"), masjidSettingsHandler.UpdateSettings)

	// ─── Users (admin-only via permission keys) ───────────────────────
	users := api.Group("/users", middleware.RequireAuth(resolver))
	users.Get("/", middleware.RequirePermission("users:read"), userHandler.ListUsers)
	users.Post("/", middleware.RequirePermission("users:write"), userHandler.CreateUser)
	users.Get("/:id", middleware.RequirePermission("users:read"), userHandler.GetUser)
	users.Put("/:id", middleware.RequirePermission("users:write"), userHandler.UpdateUser)
	users.Delete("/:id", middleware.RequirePermission("users:delete"), userHandler.DeleteUser)

	// ─── Roles + Permissions catalog ─────────────────────────────────
	roles := api.Group("/roles", middleware.RequireAuth(resolver))
	roles.Get("/", middleware.RequirePermission("roles:read"), roleHandler.ListRoles)
	// Roles are global (shared by every masjid), so only platform staff may
	// change them — a tenant admin must not alter other tenants' roles.
	roles.Post("/", middleware.RequirePlatformAdmin(), middleware.RequirePermission("roles:write"), roleHandler.CreateRole)
	roles.Put("/:id", middleware.RequirePlatformAdmin(), middleware.RequirePermission("roles:write"), roleHandler.UpdateRole)
	roles.Delete("/:id", middleware.RequirePlatformAdmin(), middleware.RequirePermission("roles:delete"), roleHandler.DeleteRole)

	perms := api.Group("/permissions", middleware.RequireAuth(resolver))
	perms.Get("/", middleware.RequirePermission("roles:read"), roleHandler.ListPermissions)
}
