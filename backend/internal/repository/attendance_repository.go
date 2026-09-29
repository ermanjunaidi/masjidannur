package repository

import (
	"errors"
	"time"

	"gorm.io/gorm"

	"backend/internal/models"
)

// AttendanceRepository handles attendance, shifts, and leave requests.
// All queries are scoped by organization + branch (orgID=0 = superadmin).
type AttendanceRepository struct {
	db *gorm.DB
}

// NewAttendanceRepository creates the repository.
func NewAttendanceRepository(db *gorm.DB) *AttendanceRepository {
	return &AttendanceRepository{db: db}
}

// ─── AttendanceDay ─────────────────────────────────────────────────────────────

// FindDayByUserDate returns the attendance row for a user on a date.
func (r *AttendanceRepository) FindDayByUserDate(userID uint, date string, orgID, branchID uint) (*models.AttendanceDay, error) {
	var day models.AttendanceDay
	err := scopeBranch(r.db, orgID, branchID).
		Where("user_id = ? AND date = ?", userID, date).
		Preload("Shift").
		First(&day).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &day, nil
}

// FindDayByID loads one attendance day.
func (r *AttendanceRepository) FindDayByID(id, orgID, branchID uint) (*models.AttendanceDay, error) {
	var day models.AttendanceDay
	err := scopeBranch(r.db, orgID, branchID).
		Preload("Shift").
		Preload("User").
		First(&day, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &day, nil
}

// CreateDay inserts a new attendance day.
func (r *AttendanceRepository) CreateDay(day *models.AttendanceDay) error {
	return r.db.Create(day).Error
}

// UpdateDay persists changes.
func (r *AttendanceRepository) UpdateDay(day *models.AttendanceDay) error {
	return r.db.Save(day).Error
}

// ListDays returns attendance rows matching filters.
func (r *AttendanceRepository) ListDays(orgID, branchID, userID uint, date, status string) ([]models.AttendanceDay, error) {
	q := scopeBranch(r.db, orgID, branchID)
	if userID > 0 {
		q = q.Where("user_id = ?", userID)
	}
	if date != "" {
		q = q.Where("date = ?", date)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var days []models.AttendanceDay
	err := q.Preload("Shift").Preload("User").Order("date DESC, id DESC").Find(&days).Error
	return days, err
}

// DeleteDay hard-deletes an attendance row (admin manual delete).
func (r *AttendanceRepository) DeleteDay(id, orgID, branchID uint) error {
	return scopeBranch(r.db, orgID, branchID).Delete(&models.AttendanceDay{}, id).Error
}

// AddLog appends an audit entry.
func (r *AttendanceRepository) AddLog(log *models.AttendanceLog) error {
	return r.db.Create(log).Error
}

// MarkDaysStatus updates attendance days in a date range to a status
// (used when a leave request is approved).
func (r *AttendanceRepository) MarkDaysStatus(orgID, branchID, userID uint, startDate, endDate, status string) error {
	q := scopeBranch(r.db, orgID, branchID).
		Model(&models.AttendanceDay{}).
		Where("user_id = ? AND date >= ? AND date <= ?", userID, startDate, endDate)
	return q.Update("status", status).Error
}

// ─── Shift ─────────────────────────────────────────────────────────────────────

// CreateShift inserts a shift.
func (r *AttendanceRepository) CreateShift(shift *models.Shift) error {
	return r.db.Create(shift).Error
}

// FindShiftByID loads a shift.
func (r *AttendanceRepository) FindShiftByID(id, orgID uint) (*models.Shift, error) {
	var shift models.Shift
	err := scopeOrg(r.db, orgID).First(&shift, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &shift, nil
}

// FindDefaultShift returns the default shift for an org/branch.
func (r *AttendanceRepository) FindDefaultShift(orgID, branchID uint) (*models.Shift, error) {
	var shift models.Shift
	err := scopeBranch(r.db, orgID, branchID).Where("is_default = true").First(&shift).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &shift, nil
}

// FindUserShift returns the shift assigned to a user on a date (or default).
func (r *AttendanceRepository) FindUserShift(userID uint, date string, orgID, branchID uint) (*models.Shift, error) {
	var assign models.UserShiftAssignment
	err := scopeBranch(r.db, orgID, branchID).
		Where("user_id = ? AND (start_date = '' OR start_date <= ?) AND (end_date = '' OR end_date >= ?)", userID, date, date).
		Order("id DESC").
		Preload("Shift").
		First(&assign).Error
	if err == nil && assign.Shift != nil {
		return assign.Shift, nil
	}
	return r.FindDefaultShift(orgID, branchID)
}

// ListShifts returns all shifts in an org/branch.
func (r *AttendanceRepository) ListShifts(orgID, branchID uint) ([]models.Shift, error) {
	var shifts []models.Shift
	err := scopeBranch(r.db, orgID, branchID).Order("start_time ASC").Find(&shifts).Error
	return shifts, err
}

// UpdateShift persists changes.
func (r *AttendanceRepository) UpdateShift(shift *models.Shift) error {
	return r.db.Save(shift).Error
}

// DeleteShift soft-deletes a shift.
func (r *AttendanceRepository) DeleteShift(id uint) error {
	return r.db.Delete(&models.Shift{}, id).Error
}

// CreateAssignment assigns a shift to a user.
func (r *AttendanceRepository) CreateAssignment(a *models.UserShiftAssignment) error {
	return r.db.Create(a).Error
}

// ListAssignments returns shift assignments, optional per user.
func (r *AttendanceRepository) ListAssignments(orgID, branchID, userID uint) ([]models.UserShiftAssignment, error) {
	q := scopeBranch(r.db, orgID, branchID)
	if userID > 0 {
		q = q.Where("user_id = ?", userID)
	}
	var assigns []models.UserShiftAssignment
	err := q.Preload("Shift").Preload("User").Order("id DESC").Find(&assigns).Error
	return assigns, err
}

// ─── LeaveRequest ──────────────────────────────────────────────────────────────

// CreateLeave inserts a leave request.
func (r *AttendanceRepository) CreateLeave(l *models.LeaveRequest) error {
	return r.db.Create(l).Error
}

// FindLeaveByID loads a leave request.
func (r *AttendanceRepository) FindLeaveByID(id, orgID, branchID uint) (*models.LeaveRequest, error) {
	var l models.LeaveRequest
	err := scopeBranch(r.db, orgID, branchID).Preload("User").First(&l, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// ListLeaves returns leave requests matching filters.
func (r *AttendanceRepository) ListLeaves(orgID, branchID, userID uint, status string) ([]models.LeaveRequest, error) {
	q := scopeBranch(r.db, orgID, branchID)
	if userID > 0 {
		q = q.Where("user_id = ?", userID)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var leaves []models.LeaveRequest
	err := q.Preload("User").Order("id DESC").Find(&leaves).Error
	return leaves, err
}

// UpdateLeave persists changes.
func (r *AttendanceRepository) UpdateLeave(l *models.LeaveRequest) error {
	return r.db.Save(l).Error
}

// HasOverlappingLeave checks for overlapping approved/pending leave.
func (r *AttendanceRepository) HasOverlappingLeave(userID uint, start, end string, orgID uint) (bool, error) {
	var count int64
	err := scopeOrg(r.db, orgID).
		Model(&models.LeaveRequest{}).
		Where("user_id = ? AND status IN ? AND start_date <= ? AND end_date >= ?", userID, []string{"menunggu", "disetujui"}, end, start).
		Count(&count).Error
	return count > 0, err
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// ParseClock converts "HH:MM" into minutes since midnight.
func ParseClock(hhmm string) (int, error) {
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return 0, err
	}
	return t.Hour()*60 + t.Minute(), nil
}

// Today returns today's date in YYYY-MM-DD using the provided location.
func Today(loc *time.Location) string {
	return time.Now().In(loc).Format("2006-01-02")
}
