package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

// InvoiceRepository handles database operations for invoices and payments.
// All queries are scoped to an organization (orgID=0 = superadmin, sees all).
type InvoiceRepository struct {
	db *gorm.DB
}

// NewInvoiceRepository creates a new InvoiceRepository.
func NewInvoiceRepository(db *gorm.DB) *InvoiceRepository {
	return &InvoiceRepository{db: db}
}

// Create inserts a new invoice.
func (r *InvoiceRepository) Create(invoice *models.Invoice) error {
	return r.db.Create(invoice).Error
}

// FindByID loads an invoice with its work order (+ items, parts) and payments, scoped by org.
func (r *InvoiceRepository) FindByID(id, orgID, branchID uint) (*models.Invoice, error) {
	var invoice models.Invoice
	err := scopeBranch(r.db, orgID, branchID).
		Preload("WorkOrder.Customer").
		Preload("WorkOrder.Vehicle").
		Preload("WorkOrder.Items").
		Preload("WorkOrder.Parts.Sparepart").
		Preload("Payments").
		First(&invoice, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

// FindByWorkOrder loads the invoice for a work order, if any.
func (r *InvoiceRepository) FindByWorkOrder(woID, orgID, branchID uint) (*models.Invoice, error) {
	var invoice models.Invoice
	err := scopeBranch(r.db, orgID, branchID).
		Preload("WorkOrder.Customer").
		Preload("WorkOrder.Vehicle").
		Preload("WorkOrder.Items").
		Preload("WorkOrder.Parts.Sparepart").
		Preload("Payments").
		Where("work_order_id = ?", woID).First(&invoice).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

// List returns invoices newest first, optionally filtered by search text.
func (r *InvoiceRepository) List(q string, orgID, branchID uint) ([]models.Invoice, error) {
	query := scopeBranch(r.db, orgID, branchID)
	if q != "" {
		like := "%" + q + "%"
		query = query.Where(
			"invoice_no ILIKE ? OR work_order_id IN (SELECT id FROM work_orders WHERE wo_number ILIKE ?) OR work_order_id IN (SELECT id FROM work_orders WHERE customer_id IN (SELECT id FROM customers WHERE name ILIKE ? OR phone ILIKE ?))",
			like, like, like, like,
		)
	}
	var invoices []models.Invoice
	err := query.Preload("WorkOrder.Customer").
		Preload("WorkOrder.Vehicle").
		Preload("WorkOrder.Items").
		Preload("WorkOrder.Parts.Sparepart").
		Preload("Payments").
		Order("id DESC").
		Find(&invoices).Error
	return invoices, err
}

// FindByNumber loads an invoice by its unique number, scoped by org.
func (r *InvoiceRepository) FindByNumber(number string, orgID, branchID uint) (*models.Invoice, error) {
	var invoice models.Invoice
	err := scopeBranch(r.db, orgID, branchID).
		Preload("WorkOrder.Customer").
		Preload("WorkOrder.Vehicle").
		Preload("WorkOrder.Items").
		Preload("WorkOrder.Parts.Sparepart").
		Preload("Payments").
		Where("invoice_no = ?", number).First(&invoice).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

// AddPayment records a payment and recomputes the invoice status atomically.
func (r *InvoiceRepository) AddPayment(payment *models.Payment) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var invoice models.Invoice
		if err := tx.First(&invoice, payment.InvoiceID).Error; err != nil {
			return err
		}
		// Verify payment belongs to the same org before mutating.
		if invoice.OrganizationID != payment.OrganizationID {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Create(payment).Error; err != nil {
			return err
		}
		var paid float64
		if err := tx.Model(&models.Payment{}).
			Where("invoice_id = ?", invoice.ID).
			Select("COALESCE(SUM(amount),0)").Scan(&paid).Error; err != nil {
			return err
		}
		status := "unpaid"
		if paid >= invoice.Total {
			status = "paid"
		} else if paid > 0 {
			status = "partial"
		}
		updates := map[string]interface{}{"status": status}
		if status == "paid" {
			updates["paid_at"] = payment.PaidAt
		}
		return tx.Model(&invoice).Updates(updates).Error
	})
}
