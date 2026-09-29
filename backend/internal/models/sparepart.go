package models

import (
	"time"

	"gorm.io/gorm"
)

// Sparepart is an inventory item (oli, ban, filter, aki, ...).
//
// SKU uniqueness is per-organization (multi-tenant), not global. The
// partial unique index `idx_spareparts_org_sku` is created at startup
// (see cmd/server/main.go) because GORM tags cannot express partial
// indexes. Do NOT re-add `uniqueIndex` here — a global unique index
// would let one bengkel block another from using the same SKU.
type Sparepart struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	SKU            string         `gorm:"size:50;not null" json:"sku"`
	Name           string         `gorm:"size:255;not null" json:"name"`
	Category       string         `gorm:"size:100" json:"category"`
	Brand          string         `gorm:"size:100" json:"brand"`
	Unit           string         `gorm:"size:20;default:pcs" json:"unit"`
	BuyPrice       float64        `json:"buy_price"`
	SellPrice      float64        `json:"sell_price"`
	StockQty       float64        `json:"stock_qty"`
	ReorderPoint   float64        `gorm:"default:0" json:"reorder_point"`
	ImageURL       string         `gorm:"size:500" json:"image_url"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// StockTransaction records every stock movement (in/out/adjust) with
// an optional reference (PO, WO, opname, rusak). This is the audit trail
// required by NFR-02.
type StockTransaction struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	OrganizationID   uint      `gorm:"index;default:0" json:"organization_id"`
	BranchID         uint      `gorm:"index;default:0" json:"branch_id"`
	SparepartID      uint      `gorm:"not null;index" json:"sparepart_id"`
	Type        string    `gorm:"size:20;not null" json:"type"` // in | out | adjust
	Qty         float64   `gorm:"not null" json:"qty"`
	UnitPrice   float64   `json:"unit_price"`
	RefType     string    `gorm:"size:30" json:"ref_type"` // PO | WO | opname | rusak
	RefID       uint      `json:"ref_id"`
	Note        string    `gorm:"size:500" json:"note"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// WorkOrder is the core service document. Status lifecycle:
// draft → menunggu → dikerjakan → menunggu_approval → selesai → diambil / batal
type WorkOrder struct {
	ID             uint             `gorm:"primaryKey" json:"id"`
	OrganizationID uint             `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint             `gorm:"index;default:0" json:"branch_id"`
	WONumber       string           `gorm:"size:30;uniqueIndex;not null" json:"wo_number"`
	CustomerID     uint             `gorm:"not null;index" json:"customer_id"`
	VehicleID      uint             `gorm:"not null;index" json:"vehicle_id"`
	MechanicID     uint             `gorm:"index" json:"mechanic_id"`
	Status         string           `gorm:"size:30;default:draft;index" json:"status"`
	ServiceType    string           `gorm:"size:50" json:"service_type"`
	Complaint      string           `gorm:"size:2000" json:"complaint"`
	Priority       string           `gorm:"size:20;default:normal" json:"priority"` // normal | cepat | darurat
	EstimateTotal  float64          `json:"estimate_total"`
	ActualTotal    float64          `json:"actual_total"`
	StartedAt      *time.Time       `json:"started_at"`
	FinishedAt     *time.Time       `json:"finished_at"`
	CompletedAt    *time.Time       `json:"completed_at"`
	CreatedBy      uint             `json:"created_by"`
	Customer       *Customer        `gorm:"foreignKey:CustomerID" json:"customer,omitempty"`
	Vehicle        *Vehicle         `gorm:"foreignKey:VehicleID" json:"vehicle,omitempty"`
	Mechanic       *User            `gorm:"foreignKey:MechanicID" json:"mechanic,omitempty"`
	Items          []WorkOrderItem  `json:"items,omitempty"`
	Parts          []WorkOrderPart  `json:"parts,omitempty"`
	Invoice        *Invoice         `json:"invoice,omitempty"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
	DeletedAt      gorm.DeletedAt   `gorm:"index" json:"-"`
}

// WorkOrderItem is a labor/service line on a WO.
type WorkOrderItem struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WorkOrderID uint      `gorm:"not null;index" json:"work_order_id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	Qty         float64   `gorm:"default:1" json:"qty"`
	UnitPrice   float64   `json:"unit_price"`
	LineTotal   float64   `json:"line_total"`
	EstHours    float64   `json:"est_hours"`
	IsApproved  bool      `json:"is_approved"`
	CreatedAt   time.Time `json:"created_at"`
}

// WorkOrderPart is a sparepart line on a WO. Claiming a part consumes
// stock and writes a StockTransaction of type out/ref_type WO.
type WorkOrderPart struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	OrganizationID uint       `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint       `gorm:"index;default:0" json:"branch_id"`
	WorkOrderID    uint       `gorm:"not null;index" json:"work_order_id"`
	SparepartID    uint       `gorm:"not null" json:"sparepart_id"`
	Qty            float64    `gorm:"not null" json:"qty"`
	UnitPrice      float64    `json:"unit_price"`
	LineTotal      float64    `json:"line_total"`
	StockTxID      uint       `json:"stock_transaction_id"`
	IsApproved     bool       `json:"is_approved"`
	CreatedBy      uint       `json:"created_by"`
	Sparepart      *Sparepart `gorm:"foreignKey:SparepartID" json:"sparepart,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}
