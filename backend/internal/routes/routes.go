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
//	books, categories, transactions and reports also pass through bookScope,
//	which limits a user locked to selected cash books to those books.
//
//	/api/books/*            — gated by `books:*`
//	/api/categories/*       — gated by `categories:*`
//	/api/transactions/*     — gated by `transactions:*`
//	/api/distributions/*    — gated by `distributions:*` (Pembagian Warga)
//	/api/residents/*        — gated by `distributions:*` (daftar warga)
//	/api/reports/*          — gated by `reports:read`
//	/api/lecturings/*       — gated by `lecturings:*`
//	/api/masjid-settings    — gated by `settings:*`
//	/api/audit-logs         — gated by `audit:read`
//	/api/users/*            — gated per-endpoint by `users:*` permissions
//	/api/roles/*            — gated per-endpoint by `roles:*`; scoped to the caller's organization
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
	residentHandler *handlers.ResidentHandler,
	auditHandler *handlers.AuditHandler,
	publicDisplayHandler *handlers.PublicDisplayHandler,
	bookScope fiber.Handler,
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
	auth.Get("/google/status", authHandler.GoogleStatus)

	// Protected auth endpoints (me, change-password). JWT required.
	authProtected := auth.Group("", middleware.RequireAuth(resolver))
	authProtected.Get("/me", authHandler.Me)
	authProtected.Put("/password", authHandler.ChangePassword)

	// ─── Buku Kas (cash books) ────────────────────────────────────────
	books := api.Group("/books", middleware.RequireAuth(resolver), bookScope)
	books.Get("/", middleware.RequirePermission("books:read"), bookHandler.ListBooks)
	books.Post("/", middleware.RequirePermission("books:write"), bookHandler.CreateBook)
	books.Get("/:id", middleware.RequirePermission("books:read"), bookHandler.GetBook)
	books.Put("/:id", middleware.RequirePermission("books:write"), bookHandler.UpdateBook)
	books.Delete("/:id", middleware.RequirePermission("books:delete"), bookHandler.DeleteBook)
	// Serah terima sisa saldo buku kas PHBI ke bendahara (own record).
	books.Get("/:id/settlement", middleware.RequirePermission("books:read"), bookHandler.GetSettlement)
	books.Post("/:id/settlement", middleware.RequirePermission("books:write"), bookHandler.CreateSettlement)
	books.Delete("/:id/settlement", middleware.RequirePermission("books:write"), bookHandler.DeleteSettlement)

	// ─── Kategori (income/expense categories) ─────────────────────────
	categories := api.Group("/categories", middleware.RequireAuth(resolver), bookScope)
	categories.Get("/", middleware.RequirePermission("categories:read"), categoryHandler.ListCategories)
	categories.Post("/", middleware.RequirePermission("categories:write"), categoryHandler.CreateCategory)
	categories.Put("/:id", middleware.RequirePermission("categories:write"), categoryHandler.UpdateCategory)
	categories.Delete("/:id", middleware.RequirePermission("categories:delete"), categoryHandler.DeleteCategory)

	// ─── Transaksi (pemasukan / pengeluaran) ──────────────────────────
	txs := api.Group("/transactions", middleware.RequireAuth(resolver), bookScope)
	txs.Get("/", middleware.RequirePermission("transactions:read"), transactionHandler.ListTransactions)
	txs.Get("/export", middleware.RequirePermission("transactions:read"), transactionHandler.ExportTransactions)
	txs.Post("/", middleware.RequirePermission("transactions:write"), transactionHandler.CreateTransaction)
	txs.Put("/:id", middleware.RequirePermission("transactions:write"), transactionHandler.UpdateTransaction)
	txs.Delete("/:id", middleware.RequirePermission("transactions:delete"), transactionHandler.DeleteTransaction)

	// ─── Laporan (monthly / category / weekly) ────────────────────────
	reports := api.Group("/reports", middleware.RequireAuth(resolver), bookScope)
	reports.Get("/monthly", middleware.RequirePermission("reports:read"), transactionHandler.MonthlyReport)
	reports.Get("/category", middleware.RequirePermission("reports:read"), transactionHandler.CategoryReport)
	reports.Get("/weekly", middleware.RequirePermission("reports:read"), transactionHandler.WeeklyReport)
	reports.Get("/period", middleware.RequirePermission("reports:read"), transactionHandler.PeriodReport)

	// ─── Pembagian Warga: daftar warga + pembagian buku kas PHBI ──────
	// Own permission keys (distributions:*), so the menu can be granted
	// without opening the whole transaction ledger. Distribution rows are
	// still pengeluaran of the book, limited by bookScope.
	dist := api.Group("/distributions", middleware.RequireAuth(resolver), bookScope)
	dist.Get("/", middleware.RequirePermission("distributions:read"), transactionHandler.ListDistributions)
	dist.Get("/books", middleware.RequirePermission("distributions:read"), transactionHandler.DistributionBooks)
	dist.Post("/", middleware.RequirePermission("distributions:write"), transactionHandler.CreateDistribution)
	dist.Put("/:id", middleware.RequirePermission("distributions:write"), transactionHandler.UpdateDistribution)
	dist.Delete("/:id", middleware.RequirePermission("distributions:delete"), transactionHandler.DeleteDistribution)

	residents := api.Group("/residents", middleware.RequireAuth(resolver))
	residents.Get("/", middleware.RequirePermission("distributions:read"), residentHandler.List)
	residents.Get("/export", middleware.RequirePermission("distributions:read"), residentHandler.Export)
	residents.Get("/template", middleware.RequirePermission("distributions:read"), residentHandler.Template)
	residents.Post("/import", middleware.RequirePermission("distributions:write"), residentHandler.Import)
	residents.Post("/", middleware.RequirePermission("distributions:write"), residentHandler.Create)
	residents.Put("/:id", middleware.RequirePermission("distributions:write"), residentHandler.Update)
	residents.Delete("/:id", middleware.RequirePermission("distributions:delete"), residentHandler.Delete)

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
	users.Post("/:id/invite", middleware.RequirePermission("users:write"), userHandler.ResendInvite)

	// ─── Roles + Permissions catalog ─────────────────────────────────
	roles := api.Group("/roles", middleware.RequireAuth(resolver))
	roles.Get("/", middleware.RequirePermission("roles:read"), roleHandler.ListRoles)
	// Roles are per masjid: every write is scoped to the caller's own
	// organization (org 0 = platform templates copied into new masjids),
	// with anti-escalation checks in RoleService.
	roles.Post("/", middleware.RequirePermission("roles:write"), roleHandler.CreateRole)
	roles.Put("/:id", middleware.RequirePermission("roles:write"), roleHandler.UpdateRole)
	roles.Delete("/:id", middleware.RequirePermission("roles:delete"), roleHandler.DeleteRole)

	// ─── Audit log (read-only; entries are written by the middleware) ─
	audit := api.Group("/audit-logs", middleware.RequireAuth(resolver))
	audit.Get("/", middleware.RequirePermission("audit:read"), auditHandler.List)

	perms := api.Group("/permissions", middleware.RequireAuth(resolver))
	perms.Get("/", middleware.RequirePermission("roles:read"), roleHandler.ListPermissions)
}
