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
	ErrNotPHBIBook        = errors.New("serah terima sisa saldo hanya untuk buku kas PHBI")
	ErrSettlementExists   = errors.New("buku kas PHBI ini sudah diserahterimakan; batalkan dulu untuk mengubahnya")
	ErrSettlementNotFound = errors.New("catatan serah terima belum ada")
	ErrSettlementAmount   = errors.New("jumlah serah terima harus lebih dari 0 dan tidak melebihi sisa saldo buku")
	ErrSettlementSameBook = errors.New("buku tujuan tidak boleh buku PHBI itu sendiri")
)

// Settlement categories are created on first use, the same way a PHBI
// book gets its "Pembagian ke Warga" category.
const (
	SettlementExpenseCategoryName = "Serah Terima ke Bendahara"
	SettlementIncomeCategoryName  = "Sisa Saldo PHBI"
)

// ─── SettlementService ────────────────────────────────────────────────────────

// SettlementService closes a PHBI book: after the event its remaining
// balance is handed to the bendahara and recorded on its own, with the
// matching pengeluaran in the PHBI book and pemasukan in the destination
// book (optional).
type SettlementService struct {
	repo     *repository.BookSettlementRepository
	bookRepo *repository.BookRepository
	catRepo  *repository.CategoryRepository
	txRepo   *repository.TransactionRepository
}

// NewSettlementService wires the dependencies.
func NewSettlementService(
	repo *repository.BookSettlementRepository,
	bookRepo *repository.BookRepository,
	catRepo *repository.CategoryRepository,
	txRepo *repository.TransactionRepository,
) *SettlementService {
	return &SettlementService{repo: repo, bookRepo: bookRepo, catRepo: catRepo, txRepo: txRepo}
}

// SettlementInfo is the current state of a PHBI book: its remaining balance
// and, when the event has ended, the handover record.
type SettlementInfo struct {
	BookID     uint                   `json:"book_id"`
	BookName   string                 `json:"book_name"`
	IsPHBI     bool                   `json:"is_phbi"`
	Balance    float64                `json:"balance"`
	Settlement *models.BookSettlement `json:"settlement"`
}

// Info returns the book balance and its settlement (nil when not closed).
func (s *SettlementService) Info(bookID uint, sc repository.Scope) (*SettlementInfo, error) {
	book, err := s.bookRepo.FindByID(bookID, sc)
	if err != nil {
		return nil, err
	}
	if book == nil {
		return nil, ErrBookNotFound
	}
	income, expense, err := s.txRepo.SumByType(sc, bookID, "", "")
	if err != nil {
		return nil, err
	}
	settlement, err := s.repo.FindByBook(bookID)
	if err != nil {
		return nil, err
	}
	return &SettlementInfo{
		BookID:     book.ID,
		BookName:   book.Name,
		IsPHBI:     book.IsPHBI,
		Balance:    income - expense,
		Settlement: settlement,
	}, nil
}

// CreateSettlementInput is the payload for handing over a PHBI balance.
type CreateSettlementInput struct {
	Date              string  `json:"date"`
	Amount            float64 `json:"amount"`
	DestinationBookID uint    `json:"destination_book_id"`
	HandedTo          string  `json:"handed_to"`
	Note              string  `json:"note"`
}

// Create records the handover. Amount 0 means "the whole remaining
// balance". The pengeluaran always lands in the PHBI book; the pemasukan in
// DestinationBookID only when one is chosen.
func (s *SettlementService) Create(
	bookID uint, sc repository.Scope, input *CreateSettlementInput, userID uint,
) (*models.BookSettlement, error) {
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
	existing, err := s.repo.FindByBook(bookID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrSettlementExists
	}

	income, expense, err := s.txRepo.SumByType(sc, bookID, "", "")
	if err != nil {
		return nil, err
	}
	balance := income - expense
	amount := input.Amount
	if amount == 0 {
		amount = balance
	}
	if amount <= 0 || amount > balance {
		return nil, ErrSettlementAmount
	}
	if input.Date == "" {
		input.Date = time.Now().Format("2006-01-02")
	}
	if !isValidDate(input.Date) {
		return nil, ErrInvalidDate
	}

	var destination *models.Book
	if input.DestinationBookID > 0 {
		if input.DestinationBookID == book.ID {
			return nil, ErrSettlementSameBook
		}
		destination, err = s.bookRepo.FindByID(input.DestinationBookID, sc)
		if err != nil {
			return nil, err
		}
		if destination == nil {
			return nil, ErrBookNotFound
		}
	}

	handedTo := strings.TrimSpace(input.HandedTo)
	if handedTo == "" {
		handedTo = "Bendahara"
	}
	description := "Sisa saldo PHBI diserahkan ke bendahara"
	if note := strings.TrimSpace(input.Note); note != "" {
		description += " — " + note
	}

	expenseCat, err := s.settlementCategory(
		book, SettlementExpenseCategoryName, "pengeluaran",
		"Sisa saldo buku kas PHBI yang diserahkan ke bendahara",
	)
	if err != nil {
		return nil, err
	}
	txs := []*models.Transaction{{
		OrganizationID: sc.OrgID,
		BranchID:       sc.BranchID,
		BookID:         book.ID,
		CategoryID:     expenseCat.ID,
		Date:           input.Date,
		Type:           "pengeluaran",
		Amount:         amount,
		IsSettlement:   true,
		Description:    description,
		PartnerName:    handedTo,
		CreatedBy:      userID,
	}}
	if destination != nil {
		incomeCat, err := s.settlementCategory(
			destination, SettlementIncomeCategoryName, "pendapatan",
			"Sisa saldo buku kas PHBI yang diserahkan ke bendahara",
		)
		if err != nil {
			return nil, err
		}
		txs = append(txs, &models.Transaction{
			OrganizationID: sc.OrgID,
			BranchID:       sc.BranchID,
			BookID:         destination.ID,
			CategoryID:     incomeCat.ID,
			Date:           input.Date,
			Type:           "pemasukan",
			Amount:         amount,
			IsSettlement:   true,
			Description:    "Sisa saldo " + book.Name,
			PartnerName:    handedTo,
			CreatedBy:      userID,
		})
	}

	settlement := &models.BookSettlement{
		OrganizationID:    sc.OrgID,
		BranchID:          sc.BranchID,
		BookID:            book.ID,
		DestinationBookID: 0,
		Date:              input.Date,
		Amount:            amount,
		HandedTo:          handedTo,
		Note:              strings.TrimSpace(input.Note),
		CreatedBy:         userID,
	}
	if destination != nil {
		settlement.DestinationBookID = destination.ID
	}
	if err := s.repo.CreateWithTransactions(settlement, txs); err != nil {
		return nil, err
	}
	return s.repo.FindByBook(bookID)
}

// Delete cancels a handover: the record and both ledger entries are removed.
func (s *SettlementService) Delete(bookID uint, sc repository.Scope) error {
	book, err := s.bookRepo.FindByID(bookID, sc)
	if err != nil {
		return err
	}
	if book == nil {
		return ErrBookNotFound
	}
	settlement, err := s.repo.FindByBook(bookID)
	if err != nil {
		return err
	}
	if settlement == nil {
		return ErrSettlementNotFound
	}
	return s.repo.DeleteWithTransactions(settlement)
}

// settlementCategory finds (or creates) one of the handover categories in a
// book.
func (s *SettlementService) settlementCategory(
	book *models.Book, name, group, description string,
) (*models.Category, error) {
	cat, err := s.catRepo.FindByNameInBook(book.ID, name, group)
	if err != nil || cat != nil {
		return cat, err
	}
	cat = &models.Category{
		OrganizationID: book.OrganizationID,
		BranchID:       book.BranchID,
		BookID:         book.ID,
		Name:           name,
		Group:          group,
		Description:    description,
	}
	if err := s.catRepo.Create(cat); err != nil {
		return nil, err
	}
	return cat, nil
}
