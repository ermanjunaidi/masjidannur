package repository

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"backend/internal/models"
)

// SparepartRepository handles database operations for spareparts and
// stock transactions. All queries are scoped to an organization (orgID=0
// = superadmin, sees all).
type SparepartRepository struct {
	db *gorm.DB
}

// NewSparepartRepository creates a new SparepartRepository.
func NewSparepartRepository(db *gorm.DB) *SparepartRepository {
	return &SparepartRepository{db: db}
}

// Create inserts a new sparepart.
func (r *SparepartRepository) Create(part *models.Sparepart) error {
	return r.db.Create(part).Error
}

// FindByID looks up a sparepart, scoped by org.
func (r *SparepartRepository) FindByID(id, orgID, branchID uint) (*models.Sparepart, error) {
	var part models.Sparepart
	err := scopeBranch(r.db, orgID, branchID).First(&part, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &part, nil
}

// FindBySKU looks up a sparepart by unique SKU, scoped by org.
func (r *SparepartRepository) FindBySKU(sku string, orgID, branchID uint) (*models.Sparepart, error) {
	var part models.Sparepart
	err := scopeBranch(r.db, orgID, branchID).Where("sku = ?", sku).First(&part).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &part, nil
}

// FindAll returns all spareparts ordered by name.
func (r *SparepartRepository) FindAll(orgID, branchID uint) ([]models.Sparepart, error) {
	var parts []models.Sparepart
	err := scopeBranch(r.db, orgID, branchID).Order("name ASC").Find(&parts).Error
	return parts, err
}

// Search returns spareparts matching sku/name/category/brand.
func (r *SparepartRepository) Search(q string, orgID, branchID uint) ([]models.Sparepart, error) {
	var parts []models.Sparepart
	like := "%" + q + "%"
	err := scopeBranch(r.db, orgID, branchID).
		Where("sku ILIKE ? OR name ILIKE ? OR category ILIKE ? OR brand ILIKE ?",
			like, like, like, like).
		Order("name ASC").Limit(50).Find(&parts).Error
	return parts, err
}

// LowStock returns parts whose stock is at or below the reorder point.
func (r *SparepartRepository) LowStock(orgID, branchID uint) ([]models.Sparepart, error) {
	var parts []models.Sparepart
	err := scopeBranch(r.db, orgID, branchID).Where("stock_qty <= reorder_point").Order("stock_qty ASC").Find(&parts).Error
	return parts, err
}

// Update saves field changes on a sparepart.
func (r *SparepartRepository) Update(part *models.Sparepart) error {
	return r.db.Save(part).Error
}

// Delete soft-deletes a sparepart.
func (r *SparepartRepository) Delete(id uint) error {
	return r.db.Delete(&models.Sparepart{}, id).Error
}

// AdjustStock applies a delta to sparepart stock and records a
// StockTransaction atomically. Negative deltas are refused when the
// resulting qty would go below zero (NFR-04).
func (r *SparepartRepository) AdjustStock(partID uint, delta float64, tx models.StockTransaction, orgID, branchID uint) error {
	return r.db.Transaction(func(tx2 *gorm.DB) error {
		var part models.Sparepart
		if err := tx2.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("organization_id = ?", orgID).
			Where("branch_id = ? OR branch_id = 0", branchID).
			First(&part, partID).Error; err != nil {
			return err
		}
		newQty := part.StockQty + delta
		if newQty < 0 {
			return ErrInsufficientStock
		}
		if err := tx2.Model(&part).Update("stock_qty", newQty).Error; err != nil {
			return err
		}
		tx.OrganizationID = orgID
		tx.BranchID = branchID
		return tx2.Create(&tx).Error
	})
}

// StockTransactions returns the audit trail for a sparepart.
func (r *SparepartRepository) StockTransactions(partID, orgID, branchID uint) ([]models.StockTransaction, error) {
	var txs []models.StockTransaction
	err := scopeBranch(r.db, orgID, branchID).Where("sparepart_id = ?", partID).Order("id DESC").Find(&txs).Error
	return txs, err
}

// ErrInsufficientStock is returned when a stock movement would drive qty below zero.
var ErrInsufficientStock = errors.New("insufficient stock")
