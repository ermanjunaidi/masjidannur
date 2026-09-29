package service

import (
	"time"

	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// DashboardService aggregates operational stats for the dashboard (FR-23).
type DashboardService struct {
	db        *gorm.DB
	woRepo    *repository.WorkOrderRepository
	invRepo   *repository.InvoiceRepository
	spareRepo *repository.SparepartRepository
	custRepo  *repository.CustomerRepository
}

// NewDashboardService wires the dependencies.
func NewDashboardService(
	db *gorm.DB,
	woRepo *repository.WorkOrderRepository,
	invRepo *repository.InvoiceRepository,
	spareRepo *repository.SparepartRepository,
	custRepo *repository.CustomerRepository,
) *DashboardService {
	return &DashboardService{db: db, woRepo: woRepo, invRepo: invRepo, spareRepo: spareRepo, custRepo: custRepo}
}

// DashboardSummary is the payload returned to the dashboard.
type DashboardSummary struct {
	TodayRevenue       float64              `json:"today_revenue"`
	TodayWorkOrders    int64                `json:"today_work_orders"`
	ActiveWorkOrders   int64                `json:"active_work_orders"`
	WaitingWorkOrders  int64                `json:"waiting_work_orders"`
	LowStockCount      int64                `json:"low_stock_count"`
	TotalCustomers     int64                `json:"total_customers"`
	UnpaidInvoiceCount int64                `json:"unpaid_invoice_count"`
	UnpaidInvoiceTotal float64              `json:"unpaid_invoice_total"`
	Queue              []QueueEntry         `json:"queue"`
	LowStock           []LowStockEntry      `json:"low_stock"`
}

// scopeOrgWhere applies tenant isolation to a query chain. orgID == 0
// (superadmin) sees all organizations.
func scopeOrgWhere(q *gorm.DB, orgID uint) *gorm.DB {
	if orgID > 0 {
		return q.Where("organization_id = ?", orgID)
	}
	return q
}

// QueueEntry is a single row in the today queue view (FR-05/FR-07).
type QueueEntry struct {
	ID          uint    `json:"id"`
	WONumber    string  `json:"wo_number"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	Customer    string  `json:"customer"`
	Plate       string  `json:"plate"`
	Mechanic    string  `json:"mechanic"`
	Total       float64 `json:"total"`
	CreatedAt   time.Time `json:"created_at"`
}

// LowStockEntry is a row in the reorder suggestion list (FR-16).
type LowStockEntry struct {
	ID       uint    `json:"id"`
	SKU      string  `json:"sku"`
	Name     string  `json:"name"`
	StockQty float64 `json:"stock_qty"`
	ReorderPoint float64 `json:"reorder_point"`
	Unit     string  `json:"unit"`
}

// Summary computes the dashboard aggregate in one pass.
func (s *DashboardService) Summary(orgID, branchID uint) (*DashboardSummary, error) {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	end := start.Add(24 * time.Hour)

	var todayRevenue float64
	if err := scopeOrgWhere(s.db.Model(&models.Payment{}), orgID).
		Where("paid_at >= ? AND paid_at < ?", start, end).
		Select("COALESCE(SUM(amount),0)").Scan(&todayRevenue).Error; err != nil {
		return nil, err
	}

	var todayWOs, activeWOs, waitingWOs int64
	if err := scopeOrgWhere(s.db.Model(&models.WorkOrder{}), orgID).
		Where("created_at >= ? AND created_at < ?", start, end).Count(&todayWOs).Error; err != nil {
		return nil, err
	}
	if err := scopeOrgWhere(s.db.Model(&models.WorkOrder{}), orgID).
		Where("status IN ?", []string{WOStatusInProgress, WOStatusWaiting, WOStatusWaitingApproval}).
		Count(&activeWOs).Error; err != nil {
		return nil, err
	}
	if err := scopeOrgWhere(s.db.Model(&models.WorkOrder{}), orgID).
		Where("status = ?", WOStatusWaiting).Count(&waitingWOs).Error; err != nil {
		return nil, err
	}

	var lowStockCount int64
	if err := scopeOrgWhere(s.db.Model(&models.Sparepart{}), orgID).
		Where("stock_qty <= reorder_point").Count(&lowStockCount).Error; err != nil {
		return nil, err
	}

	var totalCustomers int64
	if err := scopeOrgWhere(s.db.Model(&models.Customer{}), orgID).Count(&totalCustomers).Error; err != nil {
		return nil, err
	}

	var unpaidCount int64
	var unpaidTotal float64
	if err := scopeOrgWhere(s.db.Model(&models.Invoice{}), orgID).
		Where("status IN ?", []string{"unpaid", "partial"}).
		Count(&unpaidCount).Error; err != nil {
		return nil, err
	}
	if err := scopeOrgWhere(s.db.Model(&models.Invoice{}), orgID).
		Where("status IN ?", []string{"unpaid", "partial"}).
		Select("COALESCE(SUM(total),0)").Scan(&unpaidTotal).Error; err != nil {
		return nil, err
	}

	todayWOsList, err := s.woRepo.List("", &now, 0, "", orgID, branchID)
	if err != nil {
		return nil, err
	}
	queue := make([]QueueEntry, 0, len(todayWOsList))
	for _, wo := range todayWOsList {
		entry := QueueEntry{
			ID:        wo.ID,
			WONumber:  wo.WONumber,
			Status:    wo.Status,
			Priority:  wo.Priority,
			CreatedAt: wo.CreatedAt,
			Total:     wo.ActualTotal,
		}
		if wo.Customer != nil {
			entry.Customer = wo.Customer.Name
		}
		if wo.Vehicle != nil {
			entry.Plate = wo.Vehicle.Plate
		}
		if wo.Mechanic != nil {
			entry.Mechanic = wo.Mechanic.Name
		}
		queue = append(queue, entry)
	}

	lowStock, err := s.spareRepo.LowStock(orgID, branchID)
	if err != nil {
		return nil, err
	}
	lowStockEntries := make([]LowStockEntry, 0, len(lowStock))
	for _, p := range lowStock {
		lowStockEntries = append(lowStockEntries, LowStockEntry{
			ID:         p.ID,
			SKU:        p.SKU,
			Name:       p.Name,
			StockQty:   p.StockQty,
			ReorderPoint: p.ReorderPoint,
			Unit:       p.Unit,
		})
	}

	return &DashboardSummary{
		TodayRevenue:       todayRevenue,
		TodayWorkOrders:    todayWOs,
		ActiveWorkOrders:   activeWOs,
		WaitingWorkOrders:  waitingWOs,
		LowStockCount:      lowStockCount,
		TotalCustomers:     totalCustomers,
		UnpaidInvoiceCount: unpaidCount,
		UnpaidInvoiceTotal: unpaidTotal,
		Queue:              queue,
		LowStock:           lowStockEntries,
	}, nil
}
