package service

import (
	"errors"
	"fmt"
	"time"

	"backend/internal/models"
	"backend/internal/repository"
)

// InvoiceService handles business logic for invoices & payments.
type InvoiceService struct {
	invRepo *repository.InvoiceRepository
	woRepo  *repository.WorkOrderRepository
}

// NewInvoiceService wires the dependencies.
func NewInvoiceService(invRepo *repository.InvoiceRepository, woRepo *repository.WorkOrderRepository) *InvoiceService {
	return &InvoiceService{invRepo: invRepo, woRepo: woRepo}
}

// CreateInvoiceInput is the payload for billing a finished WO.
type CreateInvoiceInput struct {
	WorkOrderID uint    `json:"work_order_id"`
	Discount    float64 `json:"discount"`
	TaxRate     float64 `json:"tax_rate"`
}

// CreateInvoice generates an invoice from a WO's actual total. The WO
// must be in `selesai` (or later) state; issuing locks further edits.
func (s *InvoiceService) CreateInvoice(input *CreateInvoiceInput, actorID, orgID, branchID uint) (*models.Invoice, error) {
	if input.WorkOrderID == 0 {
		return nil, ErrMissingFields
	}
	wo, err := s.woRepo.FindByID(input.WorkOrderID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	if wo.Status != WOStatusDone && wo.Status != WOStatusPickedUp {
		return nil, errors.New("WO harus berstatus selesai sebelum dibuatkan invoice")
	}
	existing, err := s.invRepo.FindByWorkOrder(wo.ID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrInvoiceExists
	}

	subtotal := wo.ActualTotal
	discount := input.Discount
	if discount > subtotal {
		discount = subtotal
	}
	tax := (subtotal - discount) * (input.TaxRate / 100)
	total := subtotal - discount + tax
	now := time.Now()

	invoice := &models.Invoice{
		OrganizationID: orgID,
		WorkOrderID:    wo.ID,
		InvoiceNo:      fmt.Sprintf("INV-%s-%05d", now.Format("20060102"), wo.ID%100000),
		Subtotal:       subtotal,
		Discount:       discount,
		Tax:            tax,
		Total:          total,
		Status:         "unpaid",
		IssuedAt:       now,
	}
	if err := s.invRepo.Create(invoice); err != nil {
		return nil, err
	}
	return s.invRepo.FindByID(invoice.ID, orgID, branchID)
}

// GetInvoice returns a single invoice with its WO and payments.
func (s *InvoiceService) GetInvoice(id, orgID, branchID uint) (*models.Invoice, error) {
	return s.invRepo.FindByID(id, orgID, branchID)
}

// ListInvoices returns all invoices, optionally filtered by search text.
func (s *InvoiceService) ListInvoices(q string, orgID, branchID uint) ([]models.Invoice, error) {
	return s.invRepo.List(q, orgID, branchID)
}

// GetInvoiceByNumber returns the invoice with the given number (import matching).
func (s *InvoiceService) GetInvoiceByNumber(number string, orgID, branchID uint) (*models.Invoice, error) {
	return s.invRepo.FindByNumber(number, orgID, branchID)
}

// GetInvoiceByWorkOrder returns the invoice for a WO, if any.
func (s *InvoiceService) GetInvoiceByWorkOrder(woID, orgID, branchID uint) (*models.Invoice, error) {
	return s.invRepo.FindByWorkOrder(woID, orgID, branchID)
}

// AddPaymentInput is the payload for recording a payment.
type AddPaymentInput struct {
	Amount   float64 `json:"amount"`
	Method   string  `json:"method"`
	Received float64 `json:"received"` // uang diterima (tunai)
	Change   float64 `json:"change"`   // kembalian
}

// AddPayment records a payment and updates invoice status (FR-20/FR-21).
func (s *InvoiceService) AddPayment(invoiceID uint, input *AddPaymentInput, actorID, orgID, branchID uint) (*models.Invoice, error) {
	if input.Amount <= 0 {
		return nil, errors.New("nominal pembayaran harus lebih dari 0")
	}
	invoice, err := s.invRepo.FindByID(invoiceID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if invoice == nil {
		return nil, ErrInvoiceNotFound
	}
	method := input.Method
	if method == "" {
		method = "tunai"
	}
	payment := &models.Payment{
		InvoiceID:      invoiceID,
		OrganizationID: invoice.OrganizationID,
		BranchID:       invoice.BranchID,
		Amount:         input.Amount,
		Received:       input.Received,
		Change:         input.Change,
		Method:         method,
		PaidAt:         time.Now(),
		CreatedBy:      actorID,
	}
	if err := s.invRepo.AddPayment(payment); err != nil {
		return nil, err
	}
	return s.invRepo.FindByID(invoiceID, orgID, branchID)
}

var (
	ErrInvoiceNotFound = errors.New("invoice tidak ditemukan")
	ErrInvoiceExists   = errors.New("invoice untuk WO ini sudah ada")
)