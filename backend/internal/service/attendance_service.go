package service

import (
	"errors"
	"time"

	"backend/internal/models"
	"backend/internal/repository"
)

// AttendanceService handles check-in/out, shifts, leave, and reports.
type AttendanceService struct {
	repo     *repository.AttendanceRepository
	userRepo *repository.UserRepository
}

// NewAttendanceService wires the dependency.
func NewAttendanceService(repo *repository.AttendanceRepository, userRepo *repository.UserRepository) *AttendanceService {
	return &AttendanceService{repo: repo, userRepo: userRepo}
}

// Jakarta is the timezone used for all attendance timestamps.
var Jakarta = time.FixedZone("Asia/Jakarta", 7*3600)

// ─── Check-in / Check-out ──────────────────────────────────────────────────────

// CheckInInput is the payload for check-in.
type CheckInInput struct {
	BranchID  uint    `json:"branch_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Note      string  `json:"note"`
}

// CheckIn records attendance for today. Returns the attendance day.
func (s *AttendanceService) CheckIn(userID, orgID, branchID uint, input *CheckInInput) (*models.AttendanceDay, error) {
	now := time.Now().In(Jakarta)
	today := now.Format("2006-01-02")

	day, err := s.repo.FindDayByUserDate(userID, today, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if day != nil && day.CheckInAt != nil {
		return nil, errors.New("anda sudah check-in hari ini")
	}

	// Resolve shift: assigned for today, else default.
	shift, err := s.repo.FindUserShift(userID, today, orgID, branchID)
	if err != nil {
		return nil, err
	}
	status := "hadir"
	late := 0
	if shift != nil {
		startMin, err := repository.ParseClock(shift.StartTime)
		if err == nil {
			nowMin := now.Hour()*60 + now.Minute()
			if nowMin > startMin+shift.LateToleranceMinutes {
				status = "terlambat"
				late = nowMin - startMin
			}
		}
	} else {
		status = "hadir"
	}

	if day == nil {
		day = &models.AttendanceDay{
			OrganizationID: orgID,
			BranchID:       branchID,
			UserID:         userID,
			Date:           today,
			Status:         "belum_absen",
			CheckInMethod:  "manual",
			CreatedBy:      userID,
		}
		if shift != nil {
			day.ShiftID = &shift.ID
		}
		if err := s.repo.CreateDay(day); err != nil {
			return nil, err
		}
	}

	day.CheckInAt = &now
	day.Status = status
	day.LateMinutes = late
	day.Latitude = input.Latitude
	day.Longitude = input.Longitude
	day.CheckInMethod = "manual"
	day.Note = input.Note
	if shift != nil {
		day.ShiftID = &shift.ID
	}
	if err := s.repo.UpdateDay(day); err != nil {
		return nil, err
	}
	_ = s.repo.AddLog(&models.AttendanceLog{
		OrganizationID:  orgID,
		BranchID:        branchID,
		AttendanceDayID: day.ID,
		UserID:          userID,
		Action:          "in",
		At:              now,
		Note:            "check-in",
	})
	return s.repo.FindDayByID(day.ID, orgID, branchID)
}

// CheckOut closes the current attendance for today.
func (s *AttendanceService) CheckOut(userID, orgID, branchID uint) (*models.AttendanceDay, error) {
	now := time.Now().In(Jakarta)
	today := now.Format("2006-01-02")

	day, err := s.repo.FindDayByUserDate(userID, today, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if day == nil || day.CheckInAt == nil {
		return nil, errors.New("belum ada check-in hari ini")
	}
	if day.CheckOutAt != nil {
		return nil, errors.New("anda sudah check-out hari ini")
	}

	day.CheckOutAt = &now
	dur := int(now.Sub(*day.CheckInAt).Minutes())
	if dur < 0 {
		dur = 0
	}
	day.WorkDurationMinutes = dur
	if err := s.repo.UpdateDay(day); err != nil {
		return nil, err
	}
	_ = s.repo.AddLog(&models.AttendanceLog{
		OrganizationID:  orgID,
		BranchID:        branchID,
		AttendanceDayID: day.ID,
		UserID:          userID,
		Action:          "out",
		At:              now,
		Note:            "check-out",
	})
	return s.repo.FindDayByID(day.ID, orgID, branchID)
}

// TodayStatus returns the current user's attendance for today (if any).
func (s *AttendanceService) TodayStatus(userID, orgID, branchID uint) (*models.AttendanceDay, error) {
	today := time.Now().In(Jakarta).Format("2006-01-02")
	return s.repo.FindDayByUserDate(userID, today, orgID, branchID)
}

// ─── Rekap ─────────────────────────────────────────────────────────────────────

// ListAttendance filters attendance days.
func (s *AttendanceService) ListAttendance(orgID, branchID, userID uint, date, status string) ([]models.AttendanceDay, error) {
	return s.repo.ListDays(orgID, branchID, userID, date, status)
}

// ─── Rekap gaji ───────────────────────────────────────────────────────────────

// SalaryEntry is one employee's payroll summary for a date range.
type SalaryEntry struct {
	UserID          uint    `json:"user_id"`
	Name            string  `json:"name"`
	DailyWage       float64 `json:"daily_wage"`
	DailyAllowance  float64 `json:"daily_allowance"`
	WorkDays        int     `json:"work_days"`
	LateDays        int     `json:"late_days"`
	IzinDays        int     `json:"izin_days"`
	AbsentDays      int     `json:"absent_days"`
	BasePay         float64 `json:"base_pay"`        // work_days × daily_wage
	AllowanceTotal  float64 `json:"allowance_total"` // work_days × daily_allowance
	TotalSalary     float64 `json:"total_salary"`
}

// SalaryReport returns payroll recap for all active org users within a range.
func (s *AttendanceService) SalaryReport(orgID, branchID uint, from, to string) ([]SalaryEntry, error) {
	days, err := s.repo.ListDays(orgID, branchID, 0, "", "")
	if err != nil {
		return nil, err
	}
	// Filter by date range
	inRange := func(d string) bool {
		return (from == "" || d >= from) && (to == "" || d <= to)
	}
	byUser := map[uint]*SalaryEntry{}
	for _, d := range days {
		if !inRange(d.Date) {
			continue
		}
		e, ok := byUser[d.UserID]
		if !ok {
			e = &SalaryEntry{UserID: d.UserID}
			byUser[d.UserID] = e
		}
		switch d.Status {
		case "hadir", "terlambat":
			e.WorkDays++
			if d.Status == "terlambat" {
				e.LateDays++
			}
		case "izin", "sakit", "cuti":
			e.IzinDays++
		case "tanpa_keterangan":
			e.AbsentDays++
		}
	}

	// Fill user names + wage from User repo
	users, err := s.userRepo.FindAll(orgID)
	if err != nil {
		return nil, err
	}
	userMap := map[uint]*models.User{}
	for _, u := range users {
		uu := u
		userMap[u.ID] = &uu
	}
	for id, e := range byUser {
		if u, ok := userMap[id]; ok {
			e.Name = u.Name
			e.DailyWage = u.DailyWage
			e.DailyAllowance = u.DailyAllowance
		}
		e.BasePay = float64(e.WorkDays) * e.DailyWage
		e.AllowanceTotal = float64(e.WorkDays) * e.DailyAllowance
		e.TotalSalary = e.BasePay + e.AllowanceTotal
	}

	// Build final list (including users with zero days so the recap is complete)
	out := make([]SalaryEntry, 0, len(userMap))
	for _, u := range users {
		e, ok := byUser[u.ID]
		if !ok {
			e = &SalaryEntry{UserID: u.ID, Name: u.Name, DailyWage: u.DailyWage, DailyAllowance: u.DailyAllowance}
		}
		out = append(out, *e)
	}
	return out, nil
}

// ─── Shift ─────────────────────────────────────────────────────────────────────

// CreateShiftInput is the payload for creating a shift.
type CreateShiftInput struct {
	Name                 string `json:"name"`
	BranchID             uint   `json:"branch_id"`
	StartTime            string `json:"start_time"`
	EndTime              string `json:"end_time"`
	LateToleranceMinutes int    `json:"late_tolerance_minutes"`
	AllowOvertime        bool   `json:"allow_overtime"`
	IsDefault            bool   `json:"is_default"`
}

// CreateShift adds a shift.
func (s *AttendanceService) CreateShift(input *CreateShiftInput, orgID uint) (*models.Shift, error) {
	if input.Name == "" || input.StartTime == "" || input.EndTime == "" {
		return nil, ErrMissingFields
	}
	tol := input.LateToleranceMinutes
	if tol <= 0 {
		tol = 15
	}
	shift := &models.Shift{
		OrganizationID:       orgID,
		BranchID:             input.BranchID,
		Name:                 input.Name,
		StartTime:            input.StartTime,
		EndTime:              input.EndTime,
		LateToleranceMinutes: tol,
		AllowOvertime:        input.AllowOvertime,
		IsDefault:            input.IsDefault,
	}
	if err := s.repo.CreateShift(shift); err != nil {
		return nil, err
	}
	return shift, nil
}

// ListShifts returns shifts for an org/branch.
func (s *AttendanceService) ListShifts(orgID, branchID uint) ([]models.Shift, error) {
	return s.repo.ListShifts(orgID, branchID)
}

// AssignShiftInput assigns a shift to a user.
type AssignShiftInput struct {
	UserID    uint   `json:"user_id"`
	ShiftID   uint   `json:"shift_id"`
	BranchID  uint   `json:"branch_id"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

// AssignShift assigns a shift to a user.
func (s *AttendanceService) AssignShift(input *AssignShiftInput, orgID uint) (*models.UserShiftAssignment, error) {
	if input.UserID == 0 || input.ShiftID == 0 {
		return nil, ErrMissingFields
	}
	a := &models.UserShiftAssignment{
		OrganizationID: orgID,
		BranchID:       input.BranchID,
		UserID:         input.UserID,
		ShiftID:        input.ShiftID,
		StartDate:      input.StartDate,
		EndDate:        input.EndDate,
	}
	if err := s.repo.CreateAssignment(a); err != nil {
		return nil, err
	}
	return a, nil
}

// ListAssignments returns shift assignments.
func (s *AttendanceService) ListAssignments(orgID, branchID, userID uint) ([]models.UserShiftAssignment, error) {
	return s.repo.ListAssignments(orgID, branchID, userID)
}

// ─── Leave ─────────────────────────────────────────────────────────────────────

// CreateLeaveInput is the payload for a leave request.
type CreateLeaveInput struct {
	BranchID  uint   `json:"branch_id"`
	Type      string `json:"type"` // izin | sakit | cuti
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Reason    string `json:"reason"`
}

// CreateLeave submits a leave request.
func (s *AttendanceService) CreateLeave(userID, orgID uint, input *CreateLeaveInput) (*models.LeaveRequest, error) {
	if input.StartDate == "" || input.EndDate == "" {
		return nil, ErrMissingFields
	}
	if input.Type == "" {
		input.Type = "izin"
	}
	overlap, err := s.repo.HasOverlappingLeave(userID, input.StartDate, input.EndDate, orgID)
	if err != nil {
		return nil, err
	}
	if overlap {
		return nil, errors.New("sudah ada izin/cuti pada rentang tanggal tersebut")
	}
	l := &models.LeaveRequest{
		OrganizationID: orgID,
		BranchID:       input.BranchID,
		UserID:         userID,
		Type:           input.Type,
		StartDate:      input.StartDate,
		EndDate:        input.EndDate,
		Reason:         input.Reason,
		Status:         "menunggu",
	}
	if err := s.repo.CreateLeave(l); err != nil {
		return nil, err
	}
	return s.repo.FindLeaveByID(l.ID, orgID, input.BranchID)
}

// ListLeaves returns leave requests.
func (s *AttendanceService) ListLeaves(orgID, branchID, userID uint, status string) ([]models.LeaveRequest, error) {
	return s.repo.ListLeaves(orgID, branchID, userID, status)
}

// DecideLeave approves or rejects a leave request; approval marks the days.
func (s *AttendanceService) DecideLeave(id, orgID, branchID, actorID uint, approve bool) (*models.LeaveRequest, error) {
	l, err := s.repo.FindLeaveByID(id, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if l == nil {
		return nil, ErrLeaveNotFound
	}
	if l.Status != "menunggu" {
		return nil, errors.New("pengajuan sudah diputuskan")
	}
	now := time.Now()
	l.Status = "ditolak"
	if approve {
		l.Status = "disetujui"
	}
	l.ApprovedBy = actorID
	l.DecidedAt = &now
	if err := s.repo.UpdateLeave(l); err != nil {
		return nil, err
	}
	if approve {
		statusMap := map[string]string{"izin": "izin", "sakit": "sakit", "cuti": "cuti"}
		st := statusMap[l.Type]
		if st == "" {
			st = "izin"
		}
		_ = s.repo.MarkDaysStatus(orgID, l.BranchID, l.UserID, l.StartDate, l.EndDate, st)
	}
	return s.repo.FindLeaveByID(id, orgID, branchID)
}

// ErrLeaveNotFound is returned when a leave request does not exist.
var ErrLeaveNotFound = errors.New("pengajuan izin tidak ditemukan")

// ─── Admin manual input ────────────────────────────────────────────────────────

// AdminAttendanceInput is the payload for admin to manually record or edit
// an employee's attendance for a given date.
type AdminAttendanceInput struct {
	UserID                uint   `json:"user_id"`
	BranchID              uint   `json:"branch_id"`
	Date                  string `json:"date"`
	Status                string `json:"status"`
	CheckInTime           string `json:"check_in_time"`  // optional HH:MM
	CheckOutTime          string `json:"check_out_time"` // optional HH:MM
	WorkDurationMinutes   int    `json:"work_duration_minutes"`
	LateMinutes           int    `json:"late_minutes"`
	Note                  string `json:"note"`
}

// AdminUpsertAttendance creates or updates an attendance row manually.
// Uses admin-provided status/time — no auto shift calculation.
func (s *AttendanceService) AdminUpsertAttendance(orgID, branchID, actorID uint, input *AdminAttendanceInput) (*models.AttendanceDay, error) {
	if input.UserID == 0 || input.Date == "" {
		return nil, ErrMissingFields
	}
	if input.Status == "" {
		input.Status = "hadir"
	}

	day, _ := s.repo.FindDayByUserDate(input.UserID, input.Date, orgID, branchID)
	if day == nil {
		day = &models.AttendanceDay{
			OrganizationID: orgID,
			BranchID:       branchID,
			UserID:         input.UserID,
			Date:           input.Date,
			CreatedBy:      actorID,
		}
	}

	day.Status = input.Status
	day.Note = input.Note
	day.WorkDurationMinutes = input.WorkDurationMinutes
	day.LateMinutes = input.LateMinutes
	day.CheckInMethod = "manual"

	parse := func(hhmm string) *time.Time {
		if hhmm == "" {
			return nil
		}
		loc := time.FixedZone("Asia/Jakarta", 7*3600)
		t, err := time.ParseInLocation("2006-01-02 15:04", input.Date+" "+hhmm, loc)
		if err != nil {
			return nil
		}
		return &t
	}
	if t := parse(input.CheckInTime); t != nil {
		day.CheckInAt = t
	}
	if t := parse(input.CheckOutTime); t != nil {
		day.CheckOutAt = t
	}

	if day.ID == 0 {
		if err := s.repo.CreateDay(day); err != nil {
			return nil, err
		}
	} else {
		if err := s.repo.UpdateDay(day); err != nil {
			return nil, err
		}
	}
	return s.repo.FindDayByID(day.ID, orgID, branchID)
}

// AdminDeleteAttendance removes an attendance row manually.
func (s *AttendanceService) AdminDeleteAttendance(id, orgID, branchID uint) error {
	day, err := s.repo.FindDayByID(id, orgID, branchID)
	if err != nil {
		return err
	}
	if day == nil {
		return ErrAttendanceNotFound
	}
	// Hard-delete the row + audit log entry.
	if err := s.repo.DeleteDay(id, orgID, branchID); err != nil {
		return err
	}
	return nil
}

// ErrAttendanceNotFound is returned when an attendance row does not exist.
var ErrAttendanceNotFound = errors.New("data absensi tidak ditemukan")
