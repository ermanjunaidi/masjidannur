package service

import (
	"errors"
	"strings"
	"time"

	"backend/internal/models"
	"backend/internal/repository"
)

// ─── Sentinels ────────────────────────────────────────────────────────────────

var (
	ErrLecturingNotFound = errors.New("jadwal tidak ditemukan")
	ErrInvalidAudience   = errors.New("jenis jadwal harus friday, public, muslimah, atau tarawih")
	ErrInvalidTime       = errors.New("format jam harus HH:MM")
)

// ─── LecturingService ─────────────────────────────────────────────────────────

// LecturingService handles business logic for lecturing schedules
// (jadwal khatib Jumat + pengajian rutin).
type LecturingService struct {
	repo *repository.LecturingRepository
}

// NewLecturingService wires the dependency.
func NewLecturingService(repo *repository.LecturingRepository) *LecturingService {
	return &LecturingService{repo: repo}
}

// CreateLecturingInput is the payload for a new schedule entry.
type CreateLecturingInput struct {
	Audience     string `json:"audience"`
	Date         string `json:"date"`       // YYYY-MM-DD
	StartTime    string `json:"start_time"` // HH:MM, optional
	EndTime      string `json:"end_time"`   // HH:MM, optional
	TimeText     string `json:"time_text"`  // label bebas, mis. "Ba'da Maghrib"
	LecturerName string `json:"lecturer_name"`
	ImamName     string `json:"imam_name"`
	MuadzinName  string `json:"muadzin_name"`
	Title        string `json:"title"`
	BookTitle    string `json:"book_title"`
	BookWriter   string `json:"book_writer"`
	VideoLink    string `json:"video_link"`
	AudioLink    string `json:"audio_link"`
	Description  string `json:"description"`
}

// UpdateLecturingInput carries optional changes; nil = leave unchanged.
type UpdateLecturingInput struct {
	Audience     *string `json:"audience"`
	Date         *string `json:"date"`
	StartTime    *string `json:"start_time"`
	EndTime      *string `json:"end_time"`
	TimeText     *string `json:"time_text"`
	LecturerName *string `json:"lecturer_name"`
	ImamName     *string `json:"imam_name"`
	MuadzinName  *string `json:"muadzin_name"`
	Title        *string `json:"title"`
	BookTitle    *string `json:"book_title"`
	BookWriter   *string `json:"book_writer"`
	VideoLink    *string `json:"video_link"`
	AudioLink    *string `json:"audio_link"`
	Description  *string `json:"description"`
}

// CreateLecturing validates and stores a new schedule entry.
func (s *LecturingService) CreateLecturing(input *CreateLecturingInput, orgID, branchID, userID uint) (*models.Lecturing, error) {
	if !models.IsValidAudience(input.Audience) {
		return nil, ErrInvalidAudience
	}
	if strings.TrimSpace(input.LecturerName) == "" {
		return nil, ErrMasjidNameRequired
	}
	if input.Date == "" {
		input.Date = time.Now().Format("2006-01-02")
	}
	if !isValidDate(input.Date) {
		return nil, ErrInvalidDate
	}
	if err := validateTimeText(input.StartTime); err != nil {
		return nil, err
	}
	if err := validateTimeText(input.EndTime); err != nil {
		return nil, err
	}
	l := &models.Lecturing{
		OrganizationID: orgID,
		BranchID:       branchID,
		Audience:       input.Audience,
		Date:           input.Date,
		StartTime:      input.StartTime,
		EndTime:        input.EndTime,
		TimeText:       input.TimeText,
		LecturerName:   strings.TrimSpace(input.LecturerName),
		ImamName:       input.ImamName,
		MuadzinName:    input.MuadzinName,
		Title:          input.Title,
		BookTitle:      input.BookTitle,
		BookWriter:     input.BookWriter,
		VideoLink:      input.VideoLink,
		AudioLink:      input.AudioLink,
		Description:    input.Description,
		CreatedBy:      userID,
	}
	if err := s.repo.Create(l); err != nil {
		return nil, err
	}
	return l, nil
}

// UpdateLecturing applies changes, re-validating audience/date/times.
func (s *LecturingService) UpdateLecturing(id, orgID, branchID uint, input *UpdateLecturingInput) (*models.Lecturing, error) {
	l, err := s.repo.FindByID(id, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if l == nil {
		return nil, ErrLecturingNotFound
	}
	if input.Audience != nil {
		if !models.IsValidAudience(*input.Audience) {
			return nil, ErrInvalidAudience
		}
		l.Audience = *input.Audience
	}
	if input.LecturerName != nil {
		if strings.TrimSpace(*input.LecturerName) == "" {
			return nil, ErrMasjidNameRequired
		}
		l.LecturerName = strings.TrimSpace(*input.LecturerName)
	}
	if input.Date != nil {
		if !isValidDate(*input.Date) {
			return nil, ErrInvalidDate
		}
		l.Date = *input.Date
	}
	if input.StartTime != nil {
		if err := validateTimeText(*input.StartTime); err != nil {
			return nil, err
		}
		l.StartTime = *input.StartTime
	}
	if input.EndTime != nil {
		if err := validateTimeText(*input.EndTime); err != nil {
			return nil, err
		}
		l.EndTime = *input.EndTime
	}
	if input.TimeText != nil {
		l.TimeText = *input.TimeText
	}
	if input.ImamName != nil {
		l.ImamName = *input.ImamName
	}
	if input.MuadzinName != nil {
		l.MuadzinName = *input.MuadzinName
	}
	if input.Title != nil {
		l.Title = *input.Title
	}
	if input.BookTitle != nil {
		l.BookTitle = *input.BookTitle
	}
	if input.BookWriter != nil {
		l.BookWriter = *input.BookWriter
	}
	if input.VideoLink != nil {
		l.VideoLink = *input.VideoLink
	}
	if input.AudioLink != nil {
		l.AudioLink = *input.AudioLink
	}
	if input.Description != nil {
		l.Description = *input.Description
	}
	if err := s.repo.Update(l); err != nil {
		return nil, err
	}
	return l, nil
}

// DeleteLecturing soft-deletes a schedule entry.
func (s *LecturingService) DeleteLecturing(id, orgID, branchID uint) error {
	l, err := s.repo.FindByID(id, orgID, branchID)
	if err != nil {
		return err
	}
	if l == nil {
		return nil
	}
	return s.repo.Delete(id)
}

// ListLecturings returns schedules, optionally filtered by audience and
// inclusive date range.
func (s *LecturingService) ListLecturings(orgID, branchID uint, audience, from, to string) ([]models.Lecturing, error) {
	if audience != "" && !models.IsValidAudience(audience) {
		return nil, ErrInvalidAudience
	}
	if from != "" && !isValidDate(from) {
		return nil, ErrInvalidDate
	}
	if to != "" && !isValidDate(to) {
		return nil, ErrInvalidDate
	}
	return s.repo.List(orgID, branchID, audience, from, to)
}

// validateTimeText accepts "" or strict HH:MM (00-23:00-59).
func validateTimeText(s string) error {
	if s == "" {
		return nil
	}
	_, err := time.Parse("15:04", s)
	if err != nil {
		return ErrInvalidTime
	}
	return nil
}
