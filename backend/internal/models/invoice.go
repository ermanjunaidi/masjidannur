package models

import (
	"time"

	"gorm.io/gorm"
)

// Invoice is the billing document for a completed WorkOrder. Status
// transitions: unpaid → partial → paid.
type Invoice struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	WorkOrderID    uint           `gorm:"not null;uniqueIndex" json:"work_order_id"`
	InvoiceNo      string         `gorm:"size:30;uniqueIndex;not null" json:"invoice_no"`
	Subtotal       float64        `json:"subtotal"`
	Discount       float64        `json:"discount"`
	Tax            float64        `json:"tax"`
	Total          float64        `json:"total"`
	Status         string         `gorm:"size:20;default:unpaid" json:"status"` // unpaid | partial | paid
	IssuedAt       time.Time      `json:"issued_at"`
	PaidAt         *time.Time     `json:"paid_at"`
	WorkOrder      *WorkOrder     `gorm:"foreignKey:WorkOrderID" json:"work_order,omitempty"`
	Payments       []Payment      `gorm:"foreignKey:InvoiceID" json:"payments,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// Payment records a single payment against an invoice (supports partial).
type Payment struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	OrganizationID uint      `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint      `gorm:"index;default:0" json:"branch_id"`
	InvoiceID      uint      `gorm:"not null;index" json:"invoice_id"`
	Amount         float64   `gorm:"not null" json:"amount"`
	Received       float64   `gorm:"default:0" json:"received"` // uang diterima (tunai)
	Change         float64   `gorm:"default:0" json:"change"`   // kembalian
	Method    string    `gorm:"size:30;default:tunai" json:"method"` // tunai | transfer | qris
	PaidAt    time.Time `json:"paid_at"`
	CreatedBy uint      `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}