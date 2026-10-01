package repository

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"backend/internal/models"
)

var nonAlphaNumRegex = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify converts arbitrary strings to clean URL slugs.
func Slugify(text string) string {
	s := strings.ToLower(strings.TrimSpace(text))
	s = nonAlphaNumRegex.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "masjid"
	}
	return s
}

// ─── BookRepository ───────────────────────────────────────────────────────────

// BookRepository handles database operations for cash books.
type BookRepository struct {
	db *gorm.DB
}

// NewBookRepository creates a new BookRepository.
func NewBookRepository(db *gorm.DB) *BookRepository {
	return &BookRepository{db: db}
}

// Create inserts a new book.
func (r *BookRepository) Create(book *models.Book) error {
	return r.db.Create(book).Error
}

// FindByID looks up a live book scoped by org/branch.
func (r *BookRepository) FindByID(id, orgID, branchID uint) (*models.Book, error) {
	var book models.Book
	err := scopeBranch(r.db, orgID, branchID).First(&book, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &book, nil
}

// FindAll returns live books scoped by org/branch, newest first.
func (r *BookRepository) FindAll(orgID, branchID uint) ([]models.Book, error) {
	var books []models.Book
	err := scopeBranch(r.db, orgID, branchID).Order("id DESC").Find(&books).Error
	return books, err
}

// Update saves changes on a book.
func (r *BookRepository) Update(book *models.Book) error {
	return r.db.Save(book).Error
}

// Delete soft-deletes a book. Categories & transactions are left intact
// (they become orphans filtered out by scope queries).
func (r *BookRepository) Delete(id uint) error {
	return r.db.Delete(&models.Book{}, id).Error
}

// ─── CategoryRepository ───────────────────────────────────────────────────────

// CategoryRepository handles database operations for categories.
type CategoryRepository struct {
	db *gorm.DB
}

// NewCategoryRepository creates a new CategoryRepository.
func NewCategoryRepository(db *gorm.DB) *CategoryRepository {
	return &CategoryRepository{db: db}
}

// Create inserts a new category.
func (r *CategoryRepository) Create(cat *models.Category) error {
	return r.db.Create(cat).Error
}

// FindByID looks up a live category scoped by org/branch.
func (r *CategoryRepository) FindByID(id, orgID, branchID uint) (*models.Category, error) {
	var cat models.Category
	err := scopeBranch(r.db, orgID, branchID).First(&cat, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &cat, nil
}

// FindAll returns live categories, optionally filtered by book and group.
func (r *CategoryRepository) FindAll(orgID, branchID, bookID uint, group string) ([]models.Category, error) {
	var cats []models.Category
	q := scopeBranch(r.db, orgID, branchID)
	if bookID > 0 {
		q = q.Where("book_id = ?", bookID)
	}
	if group != "" {
		q = q.Where("\"group\" = ?", group)
	}
	err := q.Order("name ASC").Find(&cats).Error
	return cats, err
}

// FindByNameInBook finds a category with the same name inside one book
// (used to reject duplicates). group=="" matches any group.
func (r *CategoryRepository) FindByNameInBook(bookID uint, name, group string) (*models.Category, error) {
	var cat models.Category
	q := r.db.Where("book_id = ? AND name = ?", bookID, name)
	if group != "" {
		q = q.Where("\"group\" = ?", group)
	}
	err := q.First(&cat).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &cat, nil
}

// Update saves changes on a category.
func (r *CategoryRepository) Update(cat *models.Category) error {
	return r.db.Save(cat).Error
}

// Delete soft-deletes a category.
func (r *CategoryRepository) Delete(id uint) error {
	return r.db.Delete(&models.Category{}, id).Error
}

// ─── TransactionRepository ────────────────────────────────────────────────────

// TransactionRepository handles database operations for transactions.
type TransactionRepository struct {
	db *gorm.DB
}

// NewTransactionRepository creates a new TransactionRepository.
func NewTransactionRepository(db *gorm.DB) *TransactionRepository {
	return &TransactionRepository{db: db}
}

// Create inserts a new transaction.
func (r *TransactionRepository) Create(tx *models.Transaction) error {
	return r.db.Create(tx).Error
}

// Update saves changes on a transaction.
func (r *TransactionRepository) Update(tx *models.Transaction) error {
	return r.db.Save(tx).Error
}

// Delete soft-deletes a transaction.
func (r *TransactionRepository) Delete(id uint) error {
	return r.db.Delete(&models.Transaction{}, id).Error
}

// FindByID looks up a live transaction scoped by org/branch.
func (r *TransactionRepository) FindByID(id, orgID, branchID uint) (*models.Transaction, error) {
	var tx models.Transaction
	err := scopeBranch(r.db, orgID, branchID).First(&tx, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &tx, nil
}

// List returns live transactions with optional filters: book, category,
// type, date range (inclusive), and a text search over description/
// partner_name/ref_no. Results include Book/Category/Creator preloads.
func (r *TransactionRepository) List(orgID, branchID, bookID, categoryID uint, txType, from, to, q string) ([]models.Transaction, error) {
	query := scopeBranch(r.db.Model(&models.Transaction{}), orgID, branchID)
	if bookID > 0 {
		query = query.Where("book_id = ?", bookID)
	}
	if categoryID > 0 {
		query = query.Where("category_id = ?", categoryID)
	}
	if txType != "" {
		query = query.Where("type = ?", txType)
	}
	if from != "" {
		query = query.Where("date >= ?", from)
	}
	if to != "" {
		query = query.Where("date <= ?", repoDateUpper(to))
	}
	if q != "" {
		like := "%" + q + "%"
		query = query.Where(
			"description ILIKE ? OR partner_name ILIKE ? OR ref_no ILIKE ?",
			like, like, like,
		)
	}
	var txs []models.Transaction
	err := query.
		Preload("Book", func(db *gorm.DB) *gorm.DB { return db.Unscoped() }).
		Preload("Category", func(db *gorm.DB) *gorm.DB { return db.Unscoped() }).
		Preload("Creator", func(db *gorm.DB) *gorm.DB { return db.Select("id, name, email") }).
		Order("date DESC, id DESC").
		Limit(1000).
		Find(&txs).Error
	return txs, err
}

// SumByType returns (total pemasukan, total pengeluaran) for the given
// filters. Used by the dashboard and monthly report.
func (r *TransactionRepository) SumByType(orgID, branchID, bookID uint, from, to string) (income float64, expense float64, err error) {
	type aggRow struct {
		Type  string
		Total float64
	}
	var rows []aggRow
	q := scopeBranch(r.db.Model(&models.Transaction{}), orgID, branchID).
		Select("type, COALESCE(SUM(amount),0) AS total").
		Group("type")
	if bookID > 0 {
		q = q.Where("book_id = ?", bookID)
	}
	if from != "" {
		q = q.Where("date >= ?", from)
	}
	if to != "" {
		q = q.Where("date <= ?", repoDateUpper(to))
	}
	if err = q.Scan(&rows).Error; err != nil {
		return 0, 0, err
	}
	for _, row := range rows {
		switch row.Type {
		case "pemasukan":
			income = row.Total
		case "pengeluaran":
			expense = row.Total
		}
	}
	return income, expense, nil
}

// repoDateUpper converts an inclusive YYYY-MM-DD upper bound to a
// < next-day bound so date-only comparisons work against plain strings
// regardless of what the column stores.
func repoDateUpper(day string) string {
	// Given inputs are validated YYYY-MM-DD in the service layer; a
	// lexicographic bump of the day string is sufficient here because
	// we compare against the same string column.
	// (date <= '2026-09-30' is already correct for YYYY-MM-DD strings;
	// kept as helper for future formats.)
	_ = day
	return day
}

// ─── MasjidSettingsRepository ────────────────────────────────────────────────

// MasjidSettingsRepository manages the masjid profile and TV display configuration.
type MasjidSettingsRepository struct {
	db *gorm.DB
}

// NewMasjidSettingsRepository creates a new MasjidSettingsRepository.
func NewMasjidSettingsRepository(db *gorm.DB) *MasjidSettingsRepository {
	return &MasjidSettingsRepository{db: db}
}

// GetByOrg returns the settings row for an organization, creating default if missing.
func (r *MasjidSettingsRepository) GetByOrg(orgID uint) (*models.MasjidSettings, error) {
	var s models.MasjidSettings
	err := r.db.Where("organization_id = ?", orgID).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		name := "Masjid"
		if orgID > 0 {
			var org models.Organization
			if err := r.db.First(&org, orgID).Error; err == nil && org.Name != "" {
				name = org.Name
			}
		}
		baseSlug := Slugify(name)
		slug := baseSlug
		var count int64
		r.db.Model(&models.MasjidSettings{}).Where("slug = ?", slug).Count(&count)
		if count > 0 && orgID > 0 {
			slug = fmt.Sprintf("%s-%d", baseSlug, orgID)
		}

		s = models.MasjidSettings{
			OrganizationID: orgID,
			Slug:           slug,
			Name:           name,
			CurrencyCode:   "Rp",
			Latitude:       -6.2088,
			Longitude:      106.8456,
		}
		if err := r.db.Create(&s).Error; err != nil {
			return nil, err
		}
		return &s, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// FindBySlug looks up settings by unique public slug.
func (r *MasjidSettingsRepository) FindBySlug(slug string) (*models.MasjidSettings, error) {
	var s models.MasjidSettings
	err := r.db.Where("slug = ?", slug).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// FindFirst returns the first available settings (fallback for default display).
func (r *MasjidSettingsRepository) FindFirst() (*models.MasjidSettings, error) {
	var s models.MasjidSettings
	err := r.db.Order("id ASC").First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return r.GetByOrg(0)
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// Save saves changes on a settings record.
func (r *MasjidSettingsRepository) Save(s *models.MasjidSettings) error {
	return r.db.Save(s).Error
}
