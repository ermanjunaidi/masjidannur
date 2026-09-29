package routes

import (
	"github.com/gofiber/fiber/v2"

	"backend/internal/handlers"
	"backend/pkg/middleware"
)

// SetupRoutes registers all API routes.
//
// Permission layout:
//   /api/auth/*         — public + auth-protected (PostLogin reads JWT)
//   /api/auth/me        — JWT-only (any authenticated user)
//   /api/users/*        — gated per-endpoint by `users:*` permissions
//   /api/roles/*        — gated per-endpoint by `roles:*` permissions
//   /api/permissions    — `roles:read` (admin UI catalog)
//   /api/customers/*    — gated by `customers:*`
//   /api/vehicles/*     — gated by `vehicles:*`
//   /api/work-orders/*  — gated by `workorders:*`
//   /api/spareparts/*   — gated by `spareparts:*`
//   /api/invoices/*     — gated by `invoices:*`
//   /api/dashboard/*    — gated by `dashboard:read`
func SetupRoutes(
	app *fiber.App,
	authHandler *handlers.AuthHandler,
	userHandler *handlers.UserHandler,
	roleHandler *handlers.RoleHandler,
	customerHandler *handlers.CustomerHandler,
	sparepartHandler *handlers.SparepartHandler,
	workOrderHandler *handlers.WorkOrderHandler,
	invoiceHandler *handlers.InvoiceHandler,
	dashboardHandler *handlers.DashboardHandler,
	orgHandler *handlers.OrganizationHandler,
	branchHandler *handlers.BranchHandler,
	attendanceHandler *handlers.AttendanceHandler,
	jwtSecret string,
) {
	api := app.Group("/api")

	resolver := func() string { return jwtSecret }

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

	// ─── Organization (bengkel profile, Settings page) ────────────────
	org := api.Group("/organization", middleware.RequireAuth(resolver))
	org.Get("/", middleware.RequirePermission("settings:read"), orgHandler.GetOrganization)
	org.Put("/", middleware.RequirePermission("settings:write"), orgHandler.UpdateOrganization)

	// ─── Branches (cabang, multi-outlet) ─────────────────────────────
	// Branch management is gated behind the settings permission.
	branches := api.Group("/branches", middleware.RequireAuth(resolver))
	branches.Get("/", middleware.RequirePermission("settings:read"), branchHandler.ListBranches)
	branches.Post("/", middleware.RequirePermission("settings:write"), branchHandler.CreateBranch)
	branches.Get("/:id", middleware.RequirePermission("settings:read"), branchHandler.GetBranch)
	branches.Put("/:id", middleware.RequirePermission("settings:write"), branchHandler.UpdateBranch)
	branches.Delete("/:id", middleware.RequirePermission("settings:write"), branchHandler.DeleteBranch)

	// ─── Absensi (attendance) ────────────────────────────────────────
	attendance := api.Group("/attendance", middleware.RequireAuth(resolver))
	attendance.Post("/checkin", middleware.RequirePermission("attendance:write"), attendanceHandler.CheckIn)
	attendance.Post("/checkout", middleware.RequirePermission("attendance:write"), attendanceHandler.CheckOut)
	attendance.Get("/today", middleware.RequirePermission("attendance:read"), attendanceHandler.Today)
	attendance.Get("/report", middleware.RequirePermission("attendance_reports:read"), attendanceHandler.SalaryReport)
	attendance.Get("/", middleware.RequirePermission("attendance_reports:read"), attendanceHandler.List)
	// Admin manual input absensi karyawan (PRD-ABSENSI Fase revisi).
	attendance.Post("/", middleware.RequirePermission("attendance_reports:read"), attendanceHandler.AdminCreate)
	attendance.Delete("/:id", middleware.RequirePermission("attendance_reports:read"), attendanceHandler.AdminDelete)

	shifts := api.Group("/shifts", middleware.RequireAuth(resolver))
	shifts.Get("/", middleware.RequirePermission("shifts:read"), attendanceHandler.ListShifts)
	shifts.Post("/", middleware.RequirePermission("shifts:write"), attendanceHandler.CreateShift)
	shifts.Get("/assignments", middleware.RequirePermission("shifts:read"), attendanceHandler.ListAssignments)
	shifts.Post("/assign", middleware.RequirePermission("shifts:write"), attendanceHandler.AssignShift)

	leaves := api.Group("/leaves", middleware.RequireAuth(resolver))
	leaves.Get("/", middleware.RequirePermission("leaves:read"), attendanceHandler.ListLeaves)
	leaves.Post("/", middleware.RequirePermission("leaves:write"), attendanceHandler.CreateLeave)
	leaves.Patch("/:id/decide", middleware.RequirePermission("leaves:approve"), attendanceHandler.DecideLeave)

	// ─── Users (admin-only via permission keys) ───────────────────────
	users := api.Group("/users", middleware.RequireAuth(resolver))
	users.Get("/", middleware.RequirePermission("users:read"), userHandler.ListUsers)
	users.Get("/:id", middleware.RequirePermission("users:read"), userHandler.GetUser)
	users.Put("/:id", middleware.RequirePermission("users:write"), userHandler.UpdateUser)
	users.Delete("/:id", middleware.RequirePermission("users:delete"), userHandler.DeleteUser)

	// ─── Roles + Permissions catalog ─────────────────────────────────
	roles := api.Group("/roles", middleware.RequireAuth(resolver))
	roles.Get("/", middleware.RequirePermission("roles:read"), roleHandler.ListRoles)
	roles.Post("/", middleware.RequirePermission("roles:write"), roleHandler.CreateRole)
	roles.Put("/:id", middleware.RequirePermission("roles:write"), roleHandler.UpdateRole)
	roles.Delete("/:id", middleware.RequirePermission("roles:delete"), roleHandler.DeleteRole)

	perms := api.Group("/permissions", middleware.RequireAuth(resolver))
	perms.Get("/", middleware.RequirePermission("roles:read"), roleHandler.ListPermissions)

	// ─── Dashboard ────────────────────────────────────────────────────
	dashboard := api.Group("/dashboard", middleware.RequireAuth(resolver))
	dashboard.Get("/summary", middleware.RequirePermission("dashboard:read"), dashboardHandler.Summary)

	// ─── Customers ────────────────────────────────────────────────────
	customers := api.Group("/customers", middleware.RequireAuth(resolver))
	customers.Get("/phone/:phone", middleware.RequirePermission("customers:read"), customerHandler.GetCustomerByPhone)
	customers.Get("/", middleware.RequirePermission("customers:read"), customerHandler.ListCustomers)
	customers.Post("/", middleware.RequirePermission("customers:write"), customerHandler.CreateCustomer)
	customers.Get("/:id", middleware.RequirePermission("customers:read"), customerHandler.GetCustomer)
	customers.Put("/:id", middleware.RequirePermission("customers:write"), customerHandler.UpdateCustomer)
	customers.Delete("/:id", middleware.RequirePermission("customers:delete"), customerHandler.DeleteCustomer)

	// ─── Vehicles ─────────────────────────────────────────────────────
	vehicles := api.Group("/vehicles", middleware.RequireAuth(resolver))
	vehicles.Get("/plate/:plate", middleware.RequirePermission("vehicles:read"), customerHandler.FindVehicleByPlate)
	vehicles.Post("/", middleware.RequirePermission("vehicles:write"), customerHandler.CreateVehicle)
	vehicles.Get("/:id", middleware.RequirePermission("vehicles:read"), customerHandler.GetVehicle)
	vehicles.Put("/:id", middleware.RequirePermission("vehicles:write"), customerHandler.UpdateVehicle)
	vehicles.Delete("/:id", middleware.RequirePermission("vehicles:delete"), customerHandler.DeleteVehicle)

	// ─── Spareparts ───────────────────────────────────────────────────
	spareparts := api.Group("/spareparts", middleware.RequireAuth(resolver))
	spareparts.Get("/low-stock", middleware.RequirePermission("spareparts:read"), sparepartHandler.LowStock)
	spareparts.Get("/", middleware.RequirePermission("spareparts:read"), sparepartHandler.ListSpareparts)
	spareparts.Post("/", middleware.RequirePermission("spareparts:write"), sparepartHandler.CreateSparepart)
	spareparts.Get("/:id", middleware.RequirePermission("spareparts:read"), sparepartHandler.GetSparepart)
	spareparts.Put("/:id", middleware.RequirePermission("spareparts:write"), sparepartHandler.UpdateSparepart)
	spareparts.Delete("/:id", middleware.RequirePermission("spareparts:delete"), sparepartHandler.DeleteSparepart)
	spareparts.Get("/:id/stock-history", middleware.RequirePermission("spareparts:read"), sparepartHandler.StockHistory)
	spareparts.Post("/:id/stock", middleware.RequirePermission("spareparts:write"), sparepartHandler.AdjustStock)
	spareparts.Post("/:id/image", middleware.RequirePermission("spareparts:write"), sparepartHandler.UploadImage)

	// ─── Work Orders ──────────────────────────────────────────────────
	workOrders := api.Group("/work-orders", middleware.RequireAuth(resolver))
	workOrders.Get("/", middleware.RequirePermission("workorders:read"), workOrderHandler.ListWorkOrders)
	workOrders.Post("/", middleware.RequirePermission("workorders:write"), workOrderHandler.CreateWorkOrder)
	workOrders.Get("/:id", middleware.RequirePermission("workorders:read"), workOrderHandler.GetWorkOrder)
	workOrders.Patch("/:id/status", middleware.RequirePermission("workorders:write"), workOrderHandler.UpdateStatus)
	workOrders.Post("/:id/approve", middleware.RequirePermission("workorders:write"), workOrderHandler.ApproveAdditional)
	workOrders.Post("/:id/reject", middleware.RequirePermission("workorders:write"), workOrderHandler.RejectAdditional)
	workOrders.Post("/:id/items", middleware.RequirePermission("workorders:write"), workOrderHandler.AddItem)
	workOrders.Delete("/:id/items/:itemID", middleware.RequirePermission("workorders:write"), workOrderHandler.RemoveItem)
	workOrders.Post("/:id/parts", middleware.RequirePermission("workorders:write"), workOrderHandler.AddPart)
	workOrders.Delete("/:id/parts/:partID", middleware.RequirePermission("workorders:write"), workOrderHandler.RemovePart)

	// ─── Invoices ─────────────────────────────────────────────────────
	invoices := api.Group("/invoices", middleware.RequireAuth(resolver))
	invoices.Get("/number/:no", middleware.RequirePermission("invoices:read"), invoiceHandler.GetInvoiceByNumber)
	invoices.Get("/", middleware.RequirePermission("invoices:read"), invoiceHandler.ListInvoices)
	invoices.Post("/", middleware.RequirePermission("invoices:write"), invoiceHandler.CreateInvoice)
	invoices.Get("/:id", middleware.RequirePermission("invoices:read"), invoiceHandler.GetInvoice)
	invoices.Post("/:id/payments", middleware.RequirePermission("invoices:write"), invoiceHandler.AddPayment)
}
