package repository

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"backend/internal/models"
)

// WorkOrderRepository handles database operations for work orders and
// their line items. All queries are scoped to an organization (orgID=0
// = superadmin, sees all).
type WorkOrderRepository struct {
	db *gorm.DB
}

// NewWorkOrderRepository creates a new WorkOrderRepository.
func NewWorkOrderRepository(db *gorm.DB) *WorkOrderRepository {
	return &WorkOrderRepository{db: db}
}

// Create inserts a new work order.
func (r *WorkOrderRepository) Create(wo *models.WorkOrder) error {
	return r.db.Create(wo).Error
}

// FindByID loads a work order with relations, scoped by org.
func (r *WorkOrderRepository) FindByID(id, orgID, branchID uint) (*models.WorkOrder, error) {
	var wo models.WorkOrder
	err := scopeBranch(r.db, orgID, branchID).
		Preload("Customer").
		Preload("Vehicle").
		Preload("Mechanic").
		Preload("Items").
		Preload("Parts.Sparepart").
		Preload("Invoice.Payments").
		First(&wo, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &wo, nil
}

// FindByNumber loads a work order by its unique WO number, scoped by org.
func (r *WorkOrderRepository) FindByNumber(number string, orgID, branchID uint) (*models.WorkOrder, error) {
	var wo models.WorkOrder
	err := scopeBranch(r.db, orgID, branchID).
		Preload("Customer").
		Preload("Vehicle").
		Preload("Mechanic").
		Preload("Items").
		Preload("Parts.Sparepart").
		Preload("Invoice.Payments").
		Where("wo_number = ?", number).First(&wo).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &wo, nil
}

// List returns work orders matching the optional filters, newest first.
// When date is non-nil only WOs created that day are returned (queue view).
// q searches WO number, customer name/phone, vehicle plate/brand.
func (r *WorkOrderRepository) List(status string, date *time.Time, mechanicID uint, q string, orgID, branchID uint) ([]models.WorkOrder, error) {
	query := scopeBranch(r.db, orgID, branchID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if date != nil {
		start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
		end := start.Add(24 * time.Hour)
		query = query.Where("created_at >= ? AND created_at < ?", start, end)
	}
	if mechanicID > 0 {
		query = query.Where("mechanic_id = ?", mechanicID)
	}
	if q != "" {
		like := "%" + q + "%"
		query = query.Where(
			"wo_number ILIKE ? OR complaint ILIKE ? OR customer_id IN (SELECT id FROM customers WHERE name ILIKE ? OR phone ILIKE ?) OR vehicle_id IN (SELECT id FROM vehicles WHERE plate ILIKE ? OR brand ILIKE ?)",
			like, like, like, like, like, like,
		)
	}
	var wos []models.WorkOrder
	err := query.Preload("Customer").
		Preload("Vehicle").
		Preload("Mechanic").
		Preload("Invoice").
		Order("id DESC").
		Find(&wos).Error
	return wos, err
}

// Save persists field-level changes (status, totals, timestamps).
func (r *WorkOrderRepository) Save(wo *models.WorkOrder) error {
	return r.db.Save(wo).Error
}

// UpdateStatusField updates only the status column (and timestamps if
// provided) without touching other fields.
func (r *WorkOrderRepository) UpdateStatusField(id uint, status string, updates map[string]interface{}, orgID, branchID uint) error {
	if updates == nil {
		updates = map[string]interface{}{}
	}
	updates["status"] = status
	return scopeBranch(r.db, orgID, branchID).Model(&models.WorkOrder{}).Where("id = ?", id).Updates(updates).Error
}

// AddItem appends a labor line to a work order.
func (r *WorkOrderRepository) AddItem(item *models.WorkOrderItem) error {
	return r.db.Create(item).Error
}

// RemoveItem deletes a labor line.
func (r *WorkOrderRepository) RemoveItem(id uint) error {
	return r.db.Delete(&models.WorkOrderItem{}, id).Error
}

// AddPart claims a sparepart on a work order: decrements stock and
// records the StockTransaction atomically.
func (r *WorkOrderRepository) AddPart(part *models.WorkOrderPart) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var spare models.Sparepart
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("organization_id = ?", part.OrganizationID).
			First(&spare, part.SparepartID).Error; err != nil {
			return err
		}
		newQty := spare.StockQty - part.Qty
		if newQty < 0 {
			return ErrInsufficientStock
		}
		if err := tx.Model(&spare).Update("stock_qty", newQty).Error; err != nil {
			return err
		}
		txRec := models.StockTransaction{
			SparepartID:    part.SparepartID,
			OrganizationID: part.OrganizationID,
			Type:           "out",
			Qty:            part.Qty,
			UnitPrice:      part.UnitPrice,
			RefType:        "WO",
			RefID:          part.WorkOrderID,
			Note:           "Pemakaian sparepart WO",
			CreatedBy:      part.CreatedBy,
		}
		if err := tx.Create(&txRec).Error; err != nil {
			return err
		}
		part.StockTxID = txRec.ID
		return tx.Create(part).Error
	})
}

// RemovePart reverses a claimed part: restores stock and records a
// compensating adjust transaction.
func (r *WorkOrderRepository) RemovePart(id uint, actorID, orgID, branchID uint) (uint, error) {
	var woID uint
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var part models.WorkOrderPart
		if err := scopeBranch(tx, orgID, branchID).First(&part, id).Error; err != nil {
			return err
		}
		woID = part.WorkOrderID

		var spare models.Sparepart
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("organization_id = ?", orgID).
			First(&spare, part.SparepartID).Error; err != nil {
			return err
		}
		if err := tx.Model(&spare).Update("stock_qty", spare.StockQty+part.Qty).Error; err != nil {
			return err
		}
		txRec := models.StockTransaction{
			SparepartID:    part.SparepartID,
			OrganizationID: orgID,
			BranchID:       branchID,
			Type:           "adjust",
			Qty:            part.Qty,
			UnitPrice:      part.UnitPrice,
			RefType:        "WO",
			RefID:          woID,
			Note:           "Pengembalian part dari WO",
			CreatedBy:      actorID,
		}
		if err := tx.Create(&txRec).Error; err != nil {
			return err
		}
		return tx.Delete(&part).Error
	})
	return woID, err
}

// ApprovePending sets IsApproved=true on all unapproved items and parts.
func (r *WorkOrderRepository) ApprovePending(woID, orgID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.WorkOrderItem{}).
			Where("work_order_id = ? AND is_approved = false", woID).
			Update("is_approved", true).Error; err != nil {
			return err
		}
		return tx.Model(&models.WorkOrderPart{}).
			Where("work_order_id = ? AND is_approved = false", woID).
			Update("is_approved", true).Error
	})
}

// RemovePendingItems deletes all unapproved labor items from a WO.
func (r *WorkOrderRepository) RemovePendingItems(woID uint) error {
	return r.db.Where("work_order_id = ? AND is_approved = false", woID).
		Delete(&models.WorkOrderItem{}).Error
}

// RemovePendingParts reverses (stock back) and deletes unapproved parts.
func (r *WorkOrderRepository) RemovePendingParts(woID uint, actorID, orgID, branchID uint) error {
	var parts []models.WorkOrderPart
	if err := r.db.Where("work_order_id = ? AND is_approved = false", woID).
		Find(&parts).Error; err != nil {
		return err
	}
	for _, p := range parts {
		if _, err := r.RemovePart(p.ID, actorID, orgID, branchID); err != nil {
			return err
		}
	}
	return nil
}
