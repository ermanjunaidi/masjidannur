package service

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"backend/internal/models"
	"backend/internal/repository"
)

// ─── Sentinels ────────────────────────────────────────────────────────────────

var (
	ErrBookNotFound         = errors.New("buku kas tidak ditemukan")
	ErrCategoryNotFound     = errors.New("kategori tidak ditemukan")
	ErrTransactionNotFound  = errors.New("transaksi tidak ditemukan")
	ErrMasjidNameRequired   = errors.New("nama wajib diisi")
	ErrBookNameTaken        = errors.New("nama buku kas sudah dipakai")
	ErrCategoryTaken        = errors.New("kategori dengan nama itu sudah ada di buku ini")
	ErrInvalidGroup         = errors.New("kelompok harus pendapatan atau pengeluaran")
	ErrInvalidType          = errors.New("tipe harus pemasukan atau pengeluaran")
	ErrInvalidAmount        = errors.New("jumlah harus lebih besar dari 0")
	ErrRecipientRequired    = errors.New("nama warga wajib diisi")
	ErrInvalidDate          = errors.New("format tanggal harus YYYY-MM-DD")
	ErrCategoryMismatch     = errors.New("kategori tidak cocok dengan tipe transaksi")
	ErrCategoryInUse        = errors.New("kategori masih dipakai transaksi")
	ErrBookLocked           = errors.New("akun Anda dibatasi ke buku kas tertentu, tidak bisa menambah buku kas baru")
	ErrCategoryBookMismatch = errors.New("kategori tidak termasuk dalam buku kas yang dipilih")
	ErrSettlementTxLocked   = errors.New("transaksi serah terima sisa saldo hanya bisa dibatalkan lewat menu Buku Kas")
)

// dateRe validates the YYYY-MM-DD wire format.
var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func isValidDate(s string) bool {
	if !dateRe.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// ─── BookService ──────────────────────────────────────────────────────────────

// BookService handles business logic for cash books.
type BookService struct {
	repo *repository.BookRepository
}

// NewBookService wires the dependency.
func NewBookService(repo *repository.BookRepository) *BookService {
	return &BookService{repo: repo}
}

// CreateBookInput is the payload for creating a book.
type CreateBookInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPHBI      bool   `json:"is_phbi"`
}

// CreateBook adds a new cash book. A user locked to selected books cannot
// add one: it would fall outside their own lock.
func (s *BookService) CreateBook(input *CreateBookInput, sc repository.Scope) (*models.Book, error) {
	if sc.BookLocked() {
		return nil, ErrBookLocked
	}
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrMasjidNameRequired
	}
	book := &models.Book{
		OrganizationID: sc.OrgID,
		BranchID:       sc.BranchID,
		Name:           strings.TrimSpace(input.Name),
		Description:    input.Description,
		IsActive:       true,
		IsPHBI:         input.IsPHBI,
	}
	if err := s.repo.Create(book); err != nil {
		return nil, err
	}
	return book, nil
}

// ListBooks returns all books of the org/branch.
func (s *BookService) ListBooks(sc repository.Scope) ([]models.Book, error) {
	return s.repo.FindAll(sc)
}

// GetBook returns one book.
func (s *BookService) GetBook(id uint, sc repository.Scope) (*models.Book, error) {
	return s.repo.FindByID(id, sc)
}

// UpdateBookInput is the payload for editing a book.
type UpdateBookInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	IsActive    *bool   `json:"is_active"`
	IsPHBI      *bool   `json:"is_phbi"`
}

// UpdateBook applies changes to a book.
func (s *BookService) UpdateBook(id uint, sc repository.Scope, input *UpdateBookInput) (*models.Book, error) {
	book, err := s.repo.FindByID(id, sc)
	if err != nil {
		return nil, err
	}
	if book == nil {
		return nil, ErrBookNotFound
	}
	if input.Name != nil {
		if strings.TrimSpace(*input.Name) == "" {
			return nil, ErrMasjidNameRequired
		}
		book.Name = strings.TrimSpace(*input.Name)
	}
	if input.Description != nil {
		book.Description = *input.Description
	}
	if input.IsActive != nil {
		book.IsActive = *input.IsActive
	}
	if input.IsPHBI != nil {
		book.IsPHBI = *input.IsPHBI
	}
	if err := s.repo.Update(book); err != nil {
		return nil, err
	}
	return book, nil
}

// DeleteBook soft-deletes a book.
func (s *BookService) DeleteBook(id uint, sc repository.Scope) error {
	book, err := s.repo.FindByID(id, sc)
	if err != nil {
		return err
	}
	if book == nil {
		return nil
	}
	return s.repo.Delete(id)
}

// ─── CategoryService ──────────────────────────────────────────────────────────

// CategoryService handles business logic for income/expense categories.
type CategoryService struct {
	repo     *repository.CategoryRepository
	bookRepo *repository.BookRepository
}

// NewCategoryService wires the dependencies.
func NewCategoryService(repo *repository.CategoryRepository, bookRepo *repository.BookRepository) *CategoryService {
	return &CategoryService{repo: repo, bookRepo: bookRepo}
}

// CreateCategoryInput is the payload for creating a category.
type CreateCategoryInput struct {
	BookID      uint   `json:"book_id"`
	Name        string `json:"name"`
	Group       string `json:"group"` // pendapatan | pengeluaran
	Description string `json:"description"`
}

// CreateCategory adds a category under a book.
func (s *CategoryService) CreateCategory(input *CreateCategoryInput, sc repository.Scope) (*models.Category, error) {
	if strings.TrimSpace(input.Name) == "" || input.BookID == 0 {
		return nil, ErrMasjidNameRequired
	}
	if input.Group != "pendapatan" && input.Group != "pengeluaran" {
		return nil, ErrInvalidGroup
	}
	book, err := s.bookRepo.FindByID(input.BookID, sc)
	if err != nil {
		return nil, err
	}
	if book == nil {
		return nil, ErrBookNotFound
	}
	existing, err := s.repo.FindByNameInBook(input.BookID, strings.TrimSpace(input.Name), input.Group)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrCategoryTaken
	}
	cat := &models.Category{
		OrganizationID: sc.OrgID,
		BranchID:       sc.BranchID,
		BookID:         input.BookID,
		Name:           strings.TrimSpace(input.Name),
		Group:          input.Group,
		Description:    input.Description,
	}
	if err := s.repo.Create(cat); err != nil {
		return nil, err
	}
	return cat, nil
}

// ListCategories returns categories, optionally filtered by book/group.
func (s *CategoryService) ListCategories(sc repository.Scope, bookID uint, group string) ([]models.Category, error) {
	if group != "" && group != "pendapatan" && group != "pengeluaran" {
		return nil, ErrInvalidGroup
	}
	return s.repo.FindAll(sc, bookID, group)
}

// UpdateCategoryInput is the payload for editing a category.
type UpdateCategoryInput struct {
	Name        *string `json:"name"`
	Group       *string `json:"group"`
	Description *string `json:"description"`
}

// UpdateCategory applies changes to a category.
func (s *CategoryService) UpdateCategory(id uint, sc repository.Scope, input *UpdateCategoryInput) (*models.Category, error) {
	cat, err := s.repo.FindByID(id, sc)
	if err != nil {
		return nil, err
	}
	if cat == nil {
		return nil, ErrCategoryNotFound
	}
	if input.Name != nil {
		if strings.TrimSpace(*input.Name) == "" {
			return nil, ErrMasjidNameRequired
		}
		cat.Name = strings.TrimSpace(*input.Name)
	}
	if input.Group != nil {
		if *input.Group != "pendapatan" && *input.Group != "pengeluaran" {
			return nil, ErrInvalidGroup
		}
		cat.Group = *input.Group
	}
	if input.Description != nil {
		cat.Description = *input.Description
	}
	if err := s.repo.Update(cat); err != nil {
		return nil, err
	}
	return cat, nil
}

// DeleteCategory soft-deletes a category.
func (s *CategoryService) DeleteCategory(id uint, sc repository.Scope) error {
	cat, err := s.repo.FindByID(id, sc)
	if err != nil {
		return err
	}
	if cat == nil {
		return nil
	}
	return s.repo.Delete(id)
}

// ─── TransactionService ───────────────────────────────────────────────────────

// TransactionService handles business logic for cash transactions.
type TransactionService struct {
	repo     *repository.TransactionRepository
	catRepo  *repository.CategoryRepository
	bookRepo *repository.BookRepository
}

// NewTransactionService wires the dependencies.
func NewTransactionService(
	repo *repository.TransactionRepository,
	catRepo *repository.CategoryRepository,
	bookRepo *repository.BookRepository,
) *TransactionService {
	return &TransactionService{repo: repo, catRepo: catRepo, bookRepo: bookRepo}
}

// CreateTransactionInput is the payload for a new transaction.
type CreateTransactionInput struct {
	BookID      uint    `json:"book_id"`
	CategoryID  uint    `json:"category_id"`
	Date        string  `json:"date"` // YYYY-MM-DD, defaults to today
	Type        string  `json:"type"` // pemasukan | pengeluaran
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	PartnerName string  `json:"partner_name"`
	RefNo       string  `json:"ref_no"`
	// Distribution records a "pembagian ke warga": a pengeluaran of a
	// PHBI book to resident PartnerName (RT/RW). Type is forced to
	// pengeluaran and CategoryID may be omitted — the book's
	// "Pembagian ke Warga" category is used (created on first use).
	Distribution bool   `json:"distribution"`
	RT           string `json:"rt"`
	RW           string `json:"rw"`
}

// DistributionCategoryName is the pengeluaran category that holds a
// PHBI book's distributions to residents.
const DistributionCategoryName = "Pembagian ke Warga"

// transactionGroup maps a transaction type (pemasukan|pengeluaran)
// onto its category group (pendapatan|pengeluaran) so the two vocabularies
// can be compared. "pemasukan" and "pendapatan" both mean income.
func transactionGroup(txType string) string {
	if txType == "pemasukan" {
		return "pendapatan"
	}
	return txType
}

// CreateTransaction records a cash movement. The transaction type must
// match the category group so reports stay consistent.
func (s *TransactionService) CreateTransaction(input *CreateTransactionInput, sc repository.Scope, userID uint) (*models.Transaction, error) {
	if input.Distribution {
		input.Type = "pengeluaran"
		input.PartnerName = strings.TrimSpace(input.PartnerName)
		if input.PartnerName == "" {
			return nil, ErrRecipientRequired
		}
	}
	if input.BookID == 0 || (input.CategoryID == 0 && !input.Distribution) {
		return nil, ErrMasjidNameRequired
	}
	if input.Type != "pemasukan" && input.Type != "pengeluaran" {
		return nil, ErrInvalidType
	}
	if input.Date == "" {
		input.Date = time.Now().Format("2006-01-02")
	}
	if !isValidDate(input.Date) {
		return nil, ErrInvalidDate
	}
	book, err := s.bookRepo.FindByID(input.BookID, sc)
	if err != nil {
		return nil, err
	}
	if book == nil {
		return nil, ErrBookNotFound
	}
	if input.Distribution && !book.IsPHBI {
		return nil, ErrNotPHBIBook
	}
	if input.Amount <= 0 {
		return nil, ErrInvalidAmount
	}
	var cat *models.Category
	if input.Distribution && input.CategoryID == 0 {
		cat, err = s.distributionCategory(book)
	} else {
		cat, err = s.catRepo.FindByID(input.CategoryID, sc)
	}
	if err != nil {
		return nil, err
	}
	if cat == nil {
		return nil, ErrCategoryNotFound
	}
	if cat.BookID != book.ID {
		return nil, ErrCategoryBookMismatch
	}
	if cat.Group != transactionGroup(input.Type) {
		return nil, ErrCategoryMismatch
	}
	tx := &models.Transaction{
		OrganizationID: sc.OrgID,
		BranchID:       sc.BranchID,
		BookID:         input.BookID,
		CategoryID:     cat.ID,
		IsDistribution: input.Distribution,
		RT:             NormalizeRTRW(input.RT),
		RW:             NormalizeRTRW(input.RW),
		Date:           input.Date,
		Type:           input.Type,
		Amount:         input.Amount,
		Description:    input.Description,
		PartnerName:    input.PartnerName,
		RefNo:          input.RefNo,
		CreatedBy:      userID,
	}
	if err := s.repo.Create(tx); err != nil {
		return nil, err
	}
	return tx, nil
}

// distributionCategory returns the book's "Pembagian ke Warga" pengeluaran
// category, creating it on first use.
func (s *TransactionService) distributionCategory(book *models.Book) (*models.Category, error) {
	cat, err := s.catRepo.FindByNameInBook(book.ID, DistributionCategoryName, "pengeluaran")
	if err != nil || cat != nil {
		return cat, err
	}
	cat = &models.Category{
		OrganizationID: book.OrganizationID,
		BranchID:       book.BranchID,
		BookID:         book.ID,
		Name:           DistributionCategoryName,
		Group:          "pengeluaran",
		Description:    "Pembagian uang kepada warga",
	}
	if err := s.catRepo.Create(cat); err != nil {
		return nil, err
	}
	return cat, nil
}

// UpdateTransactionInput is the payload for editing a transaction.
type UpdateTransactionInput struct {
	CategoryID  *uint    `json:"category_id"`
	Date        *string  `json:"date"`
	Type        *string  `json:"type"`
	Amount      *float64 `json:"amount"`
	RT          *string  `json:"rt"`
	RW          *string  `json:"rw"`
	Description *string  `json:"description"`
	PartnerName *string  `json:"partner_name"`
	RefNo       *string  `json:"ref_no"`
}

// UpdateTransaction applies changes, re-validating type/category/date.
func (s *TransactionService) UpdateTransaction(id uint, sc repository.Scope, input *UpdateTransactionInput) (*models.Transaction, error) {
	tx, err := s.repo.FindByID(id, sc)
	if err != nil {
		return nil, err
	}
	if tx == nil {
		return nil, ErrTransactionNotFound
	}
	// A handover entry follows its settlement record: edit the record by
	// cancelling the handover from the Buku Kas page, not the ledger.
	if tx.IsSettlement {
		return nil, ErrSettlementTxLocked
	}
	// A distribution row is always a pengeluaran in the book's
	// "Pembagian ke Warga" category. Type and category are fixed, even
	// when the edit arrives through the generic transaction endpoint.
	if tx.IsDistribution {
		input.Type, input.CategoryID = nil, nil
	}
	if input.Type != nil {
		if *input.Type != "pemasukan" && *input.Type != "pengeluaran" {
			return nil, ErrInvalidType
		}
		tx.Type = *input.Type
	}
	if input.CategoryID != nil {
		cat, err := s.catRepo.FindByID(*input.CategoryID, sc)
		if err != nil {
			return nil, err
		}
		if cat == nil {
			return nil, ErrCategoryNotFound
		}
		if cat.BookID != tx.BookID {
			return nil, ErrCategoryBookMismatch
		}
		if cat.Group != transactionGroup(tx.Type) {
			return nil, ErrCategoryMismatch
		}
		tx.CategoryID = cat.ID
	}
	if input.Date != nil {
		if !isValidDate(*input.Date) {
			return nil, ErrInvalidDate
		}
		tx.Date = *input.Date
	}
	if input.Amount != nil {
		if *input.Amount <= 0 {
			return nil, ErrInvalidAmount
		}
		tx.Amount = *input.Amount
	}
	if input.RT != nil {
		tx.RT = NormalizeRTRW(*input.RT)
	}
	if input.RW != nil {
		tx.RW = NormalizeRTRW(*input.RW)
	}
	if input.Description != nil {
		tx.Description = *input.Description
	}
	if input.PartnerName != nil {
		if tx.IsDistribution && strings.TrimSpace(*input.PartnerName) == "" {
			return nil, ErrRecipientRequired
		}
		tx.PartnerName = *input.PartnerName
	}
	if input.RefNo != nil {
		tx.RefNo = *input.RefNo
	}
	if err := s.repo.Update(tx); err != nil {
		return nil, err
	}
	return tx, nil
}

// DeleteTransaction soft-deletes a transaction.
func (s *TransactionService) DeleteTransaction(id uint, sc repository.Scope) error {
	tx, err := s.repo.FindByID(id, sc)
	if err != nil {
		return err
	}
	if tx == nil {
		return nil
	}
	if tx.IsSettlement {
		return ErrSettlementTxLocked
	}
	return s.repo.Delete(id)
}

// ListTransactions filters transactions (all params optional).
func (s *TransactionService) ListTransactions(
	sc repository.Scope, bookID, categoryID uint,
	txType, from, to, q string,
) ([]models.Transaction, error) {
	if txType != "" && txType != "pemasukan" && txType != "pengeluaran" {
		return nil, ErrInvalidType
	}
	if from != "" && !isValidDate(from) {
		return nil, ErrInvalidDate
	}
	if to != "" && !isValidDate(to) {
		return nil, ErrInvalidDate
	}
	return s.repo.List(sc, bookID, categoryID, txType, from, to, q)
}

// ListDistributions returns a PHBI book's "pembagian ke warga" rows,
// ordered by RW, RT, then name — the order of the printed list.
func (s *TransactionService) ListDistributions(sc repository.Scope, bookID uint) ([]models.Transaction, error) {
	if bookID == 0 {
		return nil, ErrBookNotFound
	}
	return s.repo.ListDistributions(sc, bookID)
}

// PHBIBooks returns the PHBI cash books visible to the scope — the books a
// distribution can be recorded in.
func (s *TransactionService) PHBIBooks(sc repository.Scope) ([]models.Book, error) {
	books, err := s.bookRepo.FindAll(sc)
	if err != nil {
		return nil, err
	}
	out := make([]models.Book, 0, len(books))
	for _, b := range books {
		if b.IsPHBI {
			out = append(out, b)
		}
	}
	return out, nil
}

// IsDistribution reports whether the transaction is a "pembagian ke warga"
// row. The generic transaction endpoints use it to require the matching
// distributions permission before touching such a row. A missing row
// reports false with no error; the caller's own lookup then decides its
// response, as before.
func (s *TransactionService) IsDistribution(id uint, sc repository.Scope) (bool, error) {
	tx, err := s.repo.FindByID(id, sc)
	if err != nil {
		return false, err
	}
	if tx == nil {
		return false, nil
	}
	return tx.IsDistribution, nil
}

// distribution loads a transaction that is a "pembagian ke warga" row;
// any other transaction is reported as not found, so the distributions
// endpoints cannot be used to edit ordinary transactions.
func (s *TransactionService) distribution(id uint, sc repository.Scope) (*models.Transaction, error) {
	tx, err := s.repo.FindByID(id, sc)
	if err != nil {
		return nil, err
	}
	if tx == nil || !tx.IsDistribution {
		return nil, ErrTransactionNotFound
	}
	return tx, nil
}

// UpdateDistribution edits a distribution row (resident, RT/RW, money,
// date, note). Type and category are fixed.
func (s *TransactionService) UpdateDistribution(id uint, sc repository.Scope, input *UpdateTransactionInput) (*models.Transaction, error) {
	if _, err := s.distribution(id, sc); err != nil {
		return nil, err
	}
	input.Type, input.CategoryID = nil, nil
	return s.UpdateTransaction(id, sc, input)
}

// DeleteDistribution removes a distribution row.
func (s *TransactionService) DeleteDistribution(id uint, sc repository.Scope) error {
	if _, err := s.distribution(id, sc); err != nil {
		return err
	}
	return s.repo.Delete(id)
}

// DistributionSummary is what came in, what was handed out to residents,
// and what is left in one PHBI book.
type DistributionSummary struct {
	BookID            uint    `json:"book_id"`
	Income            float64 `json:"income"`
	Expense           float64 `json:"expense"`
	Balance           float64 `json:"balance"`
	Recipients        int64   `json:"recipients"`
	DistributedAmount float64 `json:"distributed_amount"`
}

// DistributionSummary totals one PHBI book.
func (s *TransactionService) DistributionSummary(sc repository.Scope, bookID uint) (*DistributionSummary, error) {
	book, err := s.bookRepo.FindByID(bookID, sc)
	if err != nil {
		return nil, err
	}
	if book == nil {
		return nil, ErrBookNotFound
	}
	if !book.IsPHBI {
		return nil, ErrNotPHBIBook
	}
	rows, err := s.repo.DistributionTotals(sc, bookID)
	if err != nil {
		return nil, err
	}
	out := &DistributionSummary{BookID: bookID}
	for _, r := range rows {
		if r.Type == "pemasukan" {
			out.Income += r.Amount
			continue
		}
		out.Expense += r.Amount
		if r.IsDistribution {
			out.Recipients += r.Count
			out.DistributedAmount += r.Amount
		}
	}
	out.Balance = out.Income - out.Expense
	return out, nil
}

// ─── Reports ──────────────────────────────────────────────────────────────────

// ReportTotals is the summary block of any cash report.
type ReportTotals struct {
	Income    float64 `json:"income"`
	Expense   float64 `json:"expense"`
	Net       float64 `json:"net"`
	StartCash float64 `json:"start_cash"`
	EndCash   float64 `json:"end_cash"`
}

// ReportRow is one line in a grouped report (category or month).
type ReportRow struct {
	ID      uint    `json:"id"`
	Name    string  `json:"name"`
	Group   string  `json:"group"`
	Income  float64 `json:"income"`
	Expense float64 `json:"expense"`
	Count   int64   `json:"count"`
}

// MonthlyReport is the classic "laporan kas bulanan": opening balance,
// per-transaction ledger lines, and closing balance for one month.
type MonthlyReport struct {
	Month  string        `json:"month"` // YYYY-MM
	BookID uint          `json:"book_id"`
	Totals ReportTotals  `json:"totals"`
	Rows   []LedgerEntry `json:"rows"`
}

// LedgerEntry is one transaction line in the monthly ledger.
type LedgerEntry struct {
	ID          uint    `json:"id"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	PartnerName string  `json:"partner_name"`
	RefNo       string  `json:"ref_no"`
	Income      float64 `json:"income"`
	Expense     float64 `json:"expense"`
}

// MonthlyReport builds the monthly ledger for a book (bookID 0 = all books).
func (s *TransactionService) MonthlyReport(sc repository.Scope, bookID uint, month string) (*MonthlyReport, error) {
	if len(month) != 7 {
		return nil, errors.New("format bulan harus YYYY-MM")
	}
	start := month + "-01"
	end, err := monthEnd(month)
	if err != nil {
		return nil, err
	}
	income, expense, err := s.repo.SumByType(sc, bookID, start, end)
	if err != nil {
		return nil, err
	}
	// Opening balance = cumulative net of everything before this month.
	startIncome, startExpense, err := s.repo.SumByType(sc, bookID, "", monthEndPrev(start))
	if err != nil {
		return nil, err
	}
	startCash := startIncome - startExpense

	txs, err := s.repo.List(sc, bookID, 0, "", start, end, "")
	if err != nil {
		return nil, err
	}
	rows := make([]LedgerEntry, 0, len(txs))
	for _, t := range txs {
		entry := LedgerEntry{
			ID:          t.ID,
			Date:        t.Date,
			Description: t.Description,
			PartnerName: t.PartnerName,
			RefNo:       t.RefNo,
		}
		if t.Category != nil {
			entry.Category = t.Category.Name
		}
		if t.Type == "pemasukan" {
			entry.Income = t.Amount
		} else {
			entry.Expense = t.Amount
		}
		rows = append(rows, entry)
	}
	return &MonthlyReport{
		Month:  month,
		BookID: bookID,
		Totals: ReportTotals{
			Income:    income,
			Expense:   expense,
			Net:       income - expense,
			StartCash: startCash,
			EndCash:   startCash + income - expense,
		},
		Rows: rows,
	}, nil
}

// CategoryReport groups income/expense per category for a date range.
func (s *TransactionService) CategoryReport(sc repository.Scope, bookID uint, from, to string) (*ReportTotals, []ReportRow, error) {
	if from != "" && !isValidDate(from) {
		return nil, nil, ErrInvalidDate
	}
	if to != "" && !isValidDate(to) {
		return nil, nil, ErrInvalidDate
	}
	txs, err := s.repo.List(sc, bookID, 0, "", from, to, "")
	if err != nil {
		return nil, nil, err
	}
	type key struct {
		id    uint
		name  string
		group string
	}
	agg := make(map[key]*ReportRow)
	var income, expense float64
	for _, t := range txs {
		k := key{id: t.CategoryID, group: t.Type}
		if t.Category != nil {
			k.name = t.Category.Name
		}
		row, ok := agg[k]
		if !ok {
			row = &ReportRow{ID: k.id, Name: k.name, Group: k.group}
			agg[k] = row
		}
		if t.Type == "pemasukan" {
			row.Income += t.Amount
			income += t.Amount
		} else {
			row.Expense += t.Amount
			expense += t.Amount
		}
		row.Count++
	}
	rows := make([]ReportRow, 0, len(agg))
	for _, r := range agg {
		rows = append(rows, *r)
	}
	// Stable order: income rows first, then expense, by name.
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			a, b := rows[i], rows[j]
			if (a.Group == "pengeluaran" && b.Group == "pendapatan") ||
				(a.Group == b.Group && a.Name > b.Name) {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	return &ReportTotals{Income: income, Expense: expense, Net: income - expense}, rows, nil
}

// WeeklyReport splits a date range into ISO weeks (starting Monday) and
// totals each week — the "laporan kas mingguan".
type WeeklyReport struct {
	From   string       `json:"from"`
	To     string       `json:"to"`
	Weeks  []WeekEntry  `json:"weeks"`
	Totals ReportTotals `json:"totals"`
}

// WeekEntry is one week bucket in the weekly report.
type WeekEntry struct {
	Start   string  `json:"start"`
	End     string  `json:"end"`
	Income  float64 `json:"income"`
	Expense float64 `json:"expense"`
	Net     float64 `json:"net"`
}

// WeeklyReport buckets transactions per week over a date range.
func (s *TransactionService) WeeklyReport(sc repository.Scope, bookID uint, from, to string) (*WeeklyReport, error) {
	if !isValidDate(from) || !isValidDate(to) {
		return nil, ErrInvalidDate
	}
	start, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, ErrInvalidDate
	}
	end, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, ErrInvalidDate
	}
	if end.Before(start) {
		return nil, errors.New("tanggal akhir sebelum tanggal awal")
	}
	// Normalize start to Monday.
	for start.Weekday() != time.Monday {
		start = start.AddDate(0, 0, -1)
	}
	weeks := make([]WeekEntry, 0, 8)
	for ws := start; !ws.After(end); ws = ws.AddDate(0, 0, 7) {
		we := ws
		weEnd := ws.AddDate(0, 0, 6)
		inc, exp, err := s.repo.SumByType(sc, bookID, we.Format("2006-01-02"), weEnd.Format("2006-01-02"))
		if err != nil {
			return nil, err
		}
		weeks = append(weeks, WeekEntry{
			Start:   we.Format("2006-01-02"),
			End:     weEnd.Format("2006-01-02"),
			Income:  inc,
			Expense: exp,
			Net:     inc - exp,
		})
	}
	var totals ReportTotals
	for _, w := range weeks {
		totals.Income += w.Income
		totals.Expense += w.Expense
	}
	totals.Net = totals.Income - totals.Expense
	return &WeeklyReport{From: from, To: to, Weeks: weeks, Totals: totals}, nil
}

// PeriodReport is the "laporan keuangan periode" — one section per book
// with saldo awal, kas masuk/keluar rows and saldo akhir for an arbitrary
// date range (e.g. Jumat s.d. Jumat), plus the grand total across books.
type PeriodReport struct {
	From   string       `json:"from"`
	To     string       `json:"to"`
	Books  []PeriodBook `json:"books"`
	Totals PeriodTotals `json:"totals"`
}

// PeriodTotals sums one book (or all books) over the period.
type PeriodTotals struct {
	Opening float64 `json:"opening"`
	Income  float64 `json:"income"`
	Expense float64 `json:"expense"`
	Closing float64 `json:"closing"`
}

// PeriodBook is one book's section in the period report.
type PeriodBook struct {
	BookID   uint          `json:"book_id"`
	Name     string        `json:"name"`
	Totals   PeriodTotals  `json:"totals"`
	Incomes  []LedgerEntry `json:"incomes"`
	Expenses []LedgerEntry `json:"expenses"`
}

// PeriodReport builds the per-book period report. Opening balance is the
// cumulative net of every transaction dated before `from`.
func (s *TransactionService) PeriodReport(sc repository.Scope, from, to string) (*PeriodReport, error) {
	if !isValidDate(from) || !isValidDate(to) {
		return nil, ErrInvalidDate
	}
	if to < from {
		return nil, errors.New("tanggal akhir sebelum tanggal awal")
	}
	books, err := s.bookRepo.FindAll(sc)
	if err != nil {
		return nil, err
	}
	// Urut sesuai urutan dibuat (buku utama biasanya dibuat pertama).
	sort.Slice(books, func(i, j int) bool { return books[i].ID < books[j].ID })
	beforeFrom := monthEndPrev(from) // = from - 1 hari
	report := &PeriodReport{From: from, To: to, Books: make([]PeriodBook, 0, len(books))}
	for _, b := range books {
		openIn, openOut, err := s.repo.SumByType(sc, b.ID, "", beforeFrom)
		if err != nil {
			return nil, err
		}
		txs, err := s.repo.List(sc, b.ID, 0, "", from, to, "")
		if err != nil {
			return nil, err
		}
		pb := PeriodBook{
			BookID:   b.ID,
			Name:     b.Name,
			Incomes:  []LedgerEntry{},
			Expenses: []LedgerEntry{},
		}
		pb.Totals.Opening = openIn - openOut
		// List returns newest first; the report reads oldest first.
		for i := len(txs) - 1; i >= 0; i-- {
			t := txs[i]
			e := LedgerEntry{
				ID:          t.ID,
				Date:        t.Date,
				Description: t.Description,
				PartnerName: t.PartnerName,
				RefNo:       t.RefNo,
			}
			if t.Category != nil {
				e.Category = t.Category.Name
			}
			if t.Type == "pemasukan" {
				e.Income = t.Amount
				pb.Totals.Income += t.Amount
				pb.Incomes = append(pb.Incomes, e)
			} else {
				e.Expense = t.Amount
				pb.Totals.Expense += t.Amount
				pb.Expenses = append(pb.Expenses, e)
			}
		}
		pb.Totals.Closing = pb.Totals.Opening + pb.Totals.Income - pb.Totals.Expense
		// Buku nonaktif yang kosong tidak perlu tampil.
		if !b.IsActive && pb.Totals.Opening == 0 && len(txs) == 0 {
			continue
		}
		report.Books = append(report.Books, pb)
		report.Totals.Opening += pb.Totals.Opening
		report.Totals.Income += pb.Totals.Income
		report.Totals.Expense += pb.Totals.Expense
		report.Totals.Closing += pb.Totals.Closing
	}
	return report, nil
}

// ─── MasjidSettingsService ───────────────────────────────────────────────────

// MasjidSettingsService reads/updates the per-tenant masjid profile & TV display settings.
type MasjidSettingsService struct {
	repo *repository.MasjidSettingsRepository
}

// NewMasjidSettingsService wires the dependency.
func NewMasjidSettingsService(repo *repository.MasjidSettingsRepository) *MasjidSettingsService {
	return &MasjidSettingsService{repo: repo}
}

// GetSettings returns the masjid profile for an organization.
func (s *MasjidSettingsService) GetSettings(orgID uint) (*models.MasjidSettings, error) {
	return s.repo.GetByOrg(orgID)
}

// GetBySlug retrieves masjid settings by unique public slug.
func (s *MasjidSettingsService) GetBySlug(slug string) (*models.MasjidSettings, error) {
	return s.repo.FindBySlug(slug)
}

// GetFirst retrieves fallback masjid settings.
func (s *MasjidSettingsService) GetFirst() (*models.MasjidSettings, error) {
	return s.repo.FindFirst()
}

// UpdateSettingsInput is the payload for editing the profile.
type UpdateSettingsInput struct {
	Name         *string  `json:"name"`
	Slug         *string  `json:"slug"`
	Address      *string  `json:"address"`
	CityName     *string  `json:"city_name"`
	Latitude     *float64 `json:"latitude"`
	Longitude    *float64 `json:"longitude"`
	Phone        *string  `json:"phone"`
	Email        *string  `json:"email"`
	CurrencyCode *string  `json:"currency_code"`
	ReportFooter *string  `json:"report_footer"`
}

// UpdateSettings applies changes to the masjid profile.
func (s *MasjidSettingsService) UpdateSettings(orgID uint, input *UpdateSettingsInput, userID uint) (*models.MasjidSettings, error) {
	sr, err := s.repo.GetByOrg(orgID)
	if err != nil {
		return nil, err
	}
	if input.Name != nil {
		if strings.TrimSpace(*input.Name) == "" {
			return nil, ErrMasjidNameRequired
		}
		sr.Name = strings.TrimSpace(*input.Name)
	}
	if input.Slug != nil {
		cleanSlug := repository.Slugify(*input.Slug)
		if cleanSlug != "" && cleanSlug != sr.Slug {
			existing, err := s.repo.FindBySlug(cleanSlug)
			if err != nil {
				return nil, err
			}
			if existing != nil && existing.OrganizationID != orgID {
				return nil, errors.New("slug URL TV display sudah digunakan masjid lain")
			}
			sr.Slug = cleanSlug
		}
	}
	if input.Address != nil {
		sr.Address = *input.Address
	}
	if input.CityName != nil {
		sr.CityName = *input.CityName
	}
	if input.Latitude != nil {
		sr.Latitude = *input.Latitude
	}
	if input.Longitude != nil {
		sr.Longitude = *input.Longitude
	}
	if input.Phone != nil {
		sr.Phone = *input.Phone
	}
	if input.Email != nil {
		sr.Email = *input.Email
	}
	if input.CurrencyCode != nil && strings.TrimSpace(*input.CurrencyCode) != "" {
		sr.CurrencyCode = strings.TrimSpace(*input.CurrencyCode)
	}
	if input.ReportFooter != nil {
		sr.ReportFooter = *input.ReportFooter
	}
	sr.UpdatedBy = userID
	if err := s.repo.Save(sr); err != nil {
		return nil, err
	}
	return sr, nil
}

// ─── date helpers ─────────────────────────────────────────────────────────────

// monthEnd returns the last day (YYYY-MM-DD) of the given YYYY-MM month.
func monthEnd(month string) (string, error) {
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return "", errors.New("format bulan harus YYYY-MM")
	}
	return t.AddDate(0, 1, -1).Format("2006-01-02"), nil
}

// monthEndPrev returns the last day of the month before the given date
// string — used as the inclusive upper bound of the "before" period.
func monthEndPrev(dateStr string) string {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return dateStr
	}
	return t.AddDate(0, 0, -1).Format("2006-01-02")
}

// Ensure fmt is used even if future edits drop the only Sprintf — keeps
// the import list stable for contributors.
var _ = fmt.Sprintf
