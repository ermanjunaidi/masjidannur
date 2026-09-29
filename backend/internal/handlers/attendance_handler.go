package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
	"backend/pkg/middleware"
)

// AttendanceHandler exposes check-in/out, shifts, leave, and reports.
type AttendanceHandler struct {
	attService *service.AttendanceService
}

// NewAttendanceHandler wires the dependency.
func NewAttendanceHandler(attService *service.AttendanceService) *AttendanceHandler {
	return &AttendanceHandler{attService: attService}
}

// actorCtx resolves orgID/branchID/userID from the request.
func actorCtx(c *fiber.Ctx) (orgID, branchID, userID uint) {
	orgID, _ = middleware.ActorOrgID(c)
	branchID, _ = middleware.ActorBranchID(c)
	userID, _ = middleware.ActorUserID(c)
	return
}

// CheckIn handles POST /api/attendance/checkin
func (h *AttendanceHandler) CheckIn(c *fiber.Ctx) error {
	var input service.CheckInInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, branchID, userID := actorCtx(c)
	if input.BranchID > 0 {
		branchID = input.BranchID
	}
	day, err := h.attService.CheckIn(userID, orgID, branchID, &input)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(day)
}

// CheckOut handles POST /api/attendance/checkout
func (h *AttendanceHandler) CheckOut(c *fiber.Ctx) error {
	orgID, branchID, userID := actorCtx(c)
	day, err := h.attService.CheckOut(userID, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(day)
}

// Today handles GET /api/attendance/today
func (h *AttendanceHandler) Today(c *fiber.Ctx) error {
	orgID, branchID, userID := actorCtx(c)
	day, err := h.attService.TodayStatus(userID, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"today": day})
}

// List handles GET /api/attendance?date=&status=&user_id=
func (h *AttendanceHandler) List(c *fiber.Ctx) error {
	orgID, branchID, _ := actorCtx(c)
	var userID uint
	if q := c.Query("user_id"); q != "" {
		if id, err := strconv.ParseUint(q, 10, 64); err == nil {
			userID = uint(id)
		}
	}
	days, err := h.attService.ListAttendance(orgID, branchID, userID, c.Query("date"), c.Query("status"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"attendance": days})
}

// SalaryReport handles GET /api/attendance/report?from=&to=
func (h *AttendanceHandler) SalaryReport(c *fiber.Ctx) error {
	orgID, branchID, _ := actorCtx(c)
	report, err := h.attService.SalaryReport(orgID, branchID, c.Query("from"), c.Query("to"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"report": report})
}

// AdminCreate handles POST /api/attendance — admin manually records attendance.
func (h *AttendanceHandler) AdminCreate(c *fiber.Ctx) error {
	var input service.AdminAttendanceInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, branchID, actorID := actorCtx(c)
	if input.BranchID > 0 {
		branchID = input.BranchID
	}
	day, err := h.attService.AdminUpsertAttendance(orgID, branchID, actorID, &input)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(day)
}

// AdminDelete handles DELETE /api/attendance/:id
func (h *AttendanceHandler) AdminDelete(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid attendance id"})
	}
	orgID, branchID, _ := actorCtx(c)
	if err := h.attService.AdminDeleteAttendance(uint(id), orgID, branchID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// ─── Shifts ────────────────────────────────────────────────────────────────────

// CreateShift handles POST /api/shifts
func (h *AttendanceHandler) CreateShift(c *fiber.Ctx) error {
	var input service.CreateShiftInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	shift, err := h.attService.CreateShift(&input, orgID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(shift)
}

// ListShifts handles GET /api/shifts
func (h *AttendanceHandler) ListShifts(c *fiber.Ctx) error {
	orgID, branchID, _ := actorCtx(c)
	shifts, err := h.attService.ListShifts(orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"shifts": shifts})
}

// AssignShift handles POST /api/shifts/assign
func (h *AttendanceHandler) AssignShift(c *fiber.Ctx) error {
	var input service.AssignShiftInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	a, err := h.attService.AssignShift(&input, orgID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(a)
}

// ListAssignments handles GET /api/shifts/assignments?user_id=
func (h *AttendanceHandler) ListAssignments(c *fiber.Ctx) error {
	orgID, branchID, _ := actorCtx(c)
	var userID uint
	if q := c.Query("user_id"); q != "" {
		if id, err := strconv.ParseUint(q, 10, 64); err == nil {
			userID = uint(id)
		}
	}
	assigns, err := h.attService.ListAssignments(orgID, branchID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"assignments": assigns})
}

// ─── Leave ─────────────────────────────────────────────────────────────────────

// CreateLeave handles POST /api/leaves
func (h *AttendanceHandler) CreateLeave(c *fiber.Ctx) error {
	var input service.CreateLeaveInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _, userID := actorCtx(c)
	l, err := h.attService.CreateLeave(userID, orgID, &input)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(l)
}

// ListLeaves handles GET /api/leaves?status=&user_id=
func (h *AttendanceHandler) ListLeaves(c *fiber.Ctx) error {
	orgID, branchID, userID := actorCtx(c)
	if q := c.Query("user_id"); q != "" {
		if id, err := strconv.ParseUint(q, 10, 64); err == nil {
			userID = uint(id)
		}
	}
	leaves, err := h.attService.ListLeaves(orgID, branchID, userID, c.Query("status"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"leaves": leaves})
}

// DecideLeave handles PATCH /api/leaves/:id/decide  { "approve": true }
func (h *AttendanceHandler) DecideLeave(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid leave id"})
	}
	var input struct {
		Approve bool `json:"approve"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, branchID, actorID := actorCtx(c)
	l, err := h.attService.DecideLeave(uint(id), orgID, branchID, actorID, input.Approve)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(l)
}
