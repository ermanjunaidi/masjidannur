package service

import (
	"errors"
	"strings"

	"backend/internal/models"
	"backend/internal/repository"
)

// SparepartService handles business logic for spareparts & stock.
type SparepartService struct {
	repo *repository.SparepartRepository
}

// NewSparepartService wires the dependency.
func NewSparepartService(repo *repository.SparepartRepository) *SparepartService {
	return &SparepartService{repo: repo}
}

// CreateSparepartInput is the payload for adding a new part to catalog.
type CreateSparepartInput struct {
	SKU        string  `json:"sku"`
	Name       string  `json:"name"`
	Category   string  `json:"category"`
	Brand      string  `json:"brand"`
	Unit       string  `json:"unit"`
	BuyPrice   float64 `json:"buy_price"`
	SellPrice  float64 `json:"sell_price"`
	StockQty   float64 `json:"stock_qty"`
	ReorderPoint float64 `json:"reorder_point"`
}

// CreateSparepart adds a new part to the catalog.
func (s *SparepartService) CreateSparepart(input *CreateSparepartInput, orgID, branchID uint) (*models.Sparepart, error) {
	if input.SKU == "" || input.Name == "" {
		return nil, ErrMissingFields
	}
	existing, err := s.repo.FindBySKU(input.SKU, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrSKUTaken
	}
	part := &models.Sparepart{
		OrganizationID: orgID,
		BranchID:       branchID,
		SKU:            input.SKU,
		Name:           input.Name,
		Category:       input.Category,
		Brand:          input.Brand,
		Unit:           input.Unit,
		BuyPrice:       input.BuyPrice,
		SellPrice:      input.SellPrice,
		StockQty:       input.StockQty,
		ReorderPoint:   input.ReorderPoint,
	}
	if err := s.repo.Create(part); err != nil {
		// Safety net for races: two concurrent creates with the same SKU can
		// both pass the FindBySKU check, then one INSERT hits the per-org
		// partial unique index. Translate the raw SQLSTATE 23505 into the
		// same user-facing message as the pre-check.
		if strings.Contains(err.Error(), "SQLSTATE 23505") || strings.Contains(err.Error(), "duplicate key") {
			return nil, ErrSKUTaken
		}
		return nil, err
	}
	return part, nil
}

// ListSpareparts returns all parts.
func (s *SparepartService) ListSpareparts(orgID, branchID uint) ([]models.Sparepart, error) {
	return s.repo.FindAll(orgID, branchID)
}

// SearchSpareparts searches by sku/name/category/brand.
func (s *SparepartService) SearchSpareparts(q string, orgID, branchID uint) ([]models.Sparepart, error) {
	if q == "" {
		return s.repo.FindAll(orgID, branchID)
	}
	return s.repo.Search(q, orgID, branchID)
}

// GetSparepart returns a single part.
func (s *SparepartService) GetSparepart(id, orgID, branchID uint) (*models.Sparepart, error) {
	return s.repo.FindByID(id, orgID, branchID)
}

// UpdateSparepartInput is the payload for editing a part.
type UpdateSparepartInput struct {
	SKU        string  `json:"sku,omitempty"`
	Name       string  `json:"name,omitempty"`
	Category   string  `json:"category,omitempty"`
	Brand      string  `json:"brand,omitempty"`
	Unit       string  `json:"unit,omitempty"`
	BuyPrice   float64 `json:"buy_price,omitempty"`
	SellPrice  float64 `json:"sell_price,omitempty"`
	ReorderPoint float64 `json:"reorder_point,omitempty"`
}

// UpdateSparepart applies changes to a part.
func (s *SparepartService) UpdateSparepart(id, orgID, branchID uint, input *UpdateSparepartInput) (*models.Sparepart, error) {
	part, err := s.repo.FindByID(id, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if part == nil {
		return nil, ErrSparepartNotFound
	}
	if input.SKU != "" {
		part.SKU = input.SKU
	}
	if input.Name != "" {
		part.Name = input.Name
	}
	if input.Category != "" {
		part.Category = input.Category
	}
	if input.Brand != "" {
		part.Brand = input.Brand
	}
	if input.Unit != "" {
		part.Unit = input.Unit
	}
	if input.BuyPrice > 0 {
		part.BuyPrice = input.BuyPrice
	}
	if input.SellPrice > 0 {
		part.SellPrice = input.SellPrice
	}
	if input.ReorderPoint > 0 {
		part.ReorderPoint = input.ReorderPoint
	}
	if err := s.repo.Update(part); err != nil {
		return nil, err
	}
	return part, nil
}

// DeleteSparepart soft-deletes a part.
func (s *SparepartService) DeleteSparepart(id uint) error {
	return s.repo.Delete(id)
}

// StockAdjustInput is used for stock-in, stock-out, and physical adjustment.
type StockAdjustInput struct {
	SparepartID uint    `json:"sparepart_id"`
	Qty         float64 `json:"qty"`
	Type        string  `json:"type"` // in | out | adjust
	UnitPrice   float64 `json:"unit_price"`
	Note        string  `json:"note"`
	CreatedBy   uint    `json:"-"`
}

// AdjustStock records a stock movement. For out movements, qty is
// converted to a negative delta inside the repository by AdjustStock.
func (s *SparepartService) AdjustStock(input *StockAdjustInput, orgID, branchID uint) error {
	delta := input.Qty
	if input.Type == "out" {
		delta = -input.Qty
	}
	tx := models.StockTransaction{
		OrganizationID: orgID,
		SparepartID:    input.SparepartID,
		Type:           input.Type,
		Qty:            input.Qty,
		UnitPrice:      input.UnitPrice,
		RefType:        input.Type,
		Note:           input.Note,
		CreatedBy:      input.CreatedBy,
	}
	return s.repo.AdjustStock(input.SparepartID, delta, tx, orgID, branchID)
}

// LowStock returns parts that need reordering.
func (s *SparepartService) LowStock(orgID, branchID uint) ([]models.Sparepart, error) {
	return s.repo.LowStock(orgID, branchID)
}

// StockHistory returns the audit trail for a part.
func (s *SparepartService) StockHistory(partID uint, orgID, branchID uint) ([]models.StockTransaction, error) {
	return s.repo.StockTransactions(partID, orgID, branchID)
}

// UpdateImageURL sets the uploaded image path on a sparepart (org-scoped).
func (s *SparepartService) UpdateImageURL(id, orgID, branchID uint, imageURL string) error {
	part, err := s.repo.FindByID(id, orgID, branchID)
	if err != nil {
		return err
	}
	if part == nil {
		return ErrSparepartNotFound
	}
	part.ImageURL = imageURL
	return s.repo.Update(part)
}

var (
	ErrSKUTaken          = errors.New("SKU sudah terdaftar")
	ErrSparepartNotFound = errors.New("sparepart tidak ditemukan")
)