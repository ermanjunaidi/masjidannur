package service

import (
	"errors"
	"fmt"
	"time"

	"backend/internal/models"
	"backend/internal/repository"
)

// WorkOrderService handles business logic for work orders.
type WorkOrderService struct {
	woRepo   *repository.WorkOrderRepository
	custRepo *repository.CustomerRepository
	spareRepo *repository.SparepartRepository
}

// NewWorkOrderService wires the dependencies.
func NewWorkOrderService(
	woRepo *repository.WorkOrderRepository,
	custRepo *repository.CustomerRepository,
	spareRepo *repository.SparepartRepository,
) *WorkOrderService {
	return &WorkOrderService{woRepo: woRepo, custRepo: custRepo, spareRepo: spareRepo}
}

// WO statuses.
const (
	WOStatusDraft            = "draft"
	WOStatusWaiting          = "menunggu"
	WOStatusInProgress       = "dikerjakan"
	WOStatusWaitingApproval  = "menunggu_approval"
	WOStatusDone             = "selesai"
	WOStatusPickedUp         = "diambil"
	WOStatusCancelled        = "batal"
)

// allowedStatusTransitions guards the WO state machine (FR-09).
var allowedStatusTransitions = map[string][]string{
	WOStatusDraft:           {WOStatusWaiting, WOStatusCancelled},
	WOStatusWaiting:         {WOStatusInProgress, WOStatusCancelled},
	WOStatusInProgress:      {WOStatusWaitingApproval, WOStatusDone, WOStatusCancelled},
	WOStatusWaitingApproval: {WOStatusInProgress, WOStatusDone},
	WOStatusDone:            {WOStatusPickedUp},
	WOStatusPickedUp:        {},
	WOStatusCancelled:       {},
}

// CreateWorkOrderInput is the payload for opening a new WO.
type CreateWorkOrderInput struct {
	CustomerID  uint   `json:"customer_id"`
	VehicleID   uint   `json:"vehicle_id"`
	MechanicID  uint   `json:"mechanic_id"`
	ServiceType string `json:"service_type"`
	Complaint   string `json:"complaint"`
	Priority    string `json:"priority"`
}

// CreateWorkOrder opens a new WO in `draft` state.
func (s *WorkOrderService) CreateWorkOrder(input *CreateWorkOrderInput, actorID, orgID, branchID uint) (*models.WorkOrder, error) {
	if input.CustomerID == 0 || input.VehicleID == 0 {
		return nil, ErrMissingFields
	}
	customer, err := s.custRepo.FindByID(input.CustomerID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if customer == nil {
		return nil, ErrCustomerNotFound
	}
	vehicle, err := s.custRepo.FindVehicleByID(input.VehicleID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if vehicle == nil {
		return nil, ErrVehicleNotFound
	}
	if vehicle.CustomerID != customer.ID {
		return nil, errors.New("kendaraan bukan milik pelanggan tersebut")
	}
	priority := input.Priority
	if priority == "" {
		priority = "normal"
	}
	wo := &models.WorkOrder{
		OrganizationID: orgID,
		BranchID:       branchID,
		WONumber:       s.newWONumber(orgID),
		CustomerID:     input.CustomerID,
		VehicleID:      input.VehicleID,
		MechanicID:     input.MechanicID,
		Status:         WOStatusDraft,
		ServiceType:    input.ServiceType,
		Complaint:      input.Complaint,
		Priority:       priority,
		CreatedBy:      actorID,
	}
	if err := s.woRepo.Create(wo); err != nil {
		return nil, err
	}
	return s.woRepo.FindByID(wo.ID, orgID, branchID)
}

// newWONumber generates a unique WO number; collision is retried.
func (s *WorkOrderService) newWONumber(orgID uint) string {
	for i := 0; i < 5; i++ {
		number := time.Now().Format("WO-20060102-150405")
		existing, err := s.woRepo.FindByNumber(number, orgID, 0)
		if err == nil && existing == nil {
			return number
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Sprintf("WO-%d", time.Now().UnixNano())
}

// GetWorkOrder returns a single WO with all relations.
func (s *WorkOrderService) GetWorkOrder(id, orgID, branchID uint) (*models.WorkOrder, error) {
	return s.woRepo.FindByID(id, orgID, branchID)
}

// ListWorkOrders filters by optional status / date / mechanic / search text.
func (s *WorkOrderService) ListWorkOrders(status string, date *time.Time, mechanicID uint, q string, orgID, branchID uint) ([]models.WorkOrder, error) {
	return s.woRepo.List(status, date, mechanicID, q, orgID, branchID)
}

// UpdateStatus applies a guarded status transition and maintains the
// relevant timestamps (started_at when work begins, finished_at when
// done, completed_at when picked up).
func (s *WorkOrderService) UpdateStatus(id uint, status string, orgID, branchID uint) (*models.WorkOrder, error) {
	wo, err := s.woRepo.FindByID(id, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	allowed, ok := allowedStatusTransitions[wo.Status]
	if !ok || !contains(allowed, status) {
		return nil, fmt.Errorf("transisi status dari %q ke %q tidak diizinkan", wo.Status, status)
	}
	now := time.Now()
	wo.Status = status
	updates := map[string]interface{}{}
	switch status {
	case WOStatusInProgress:
		wo.StartedAt = &now
		updates["started_at"] = now
	case WOStatusDone:
		wo.FinishedAt = &now
		updates["finished_at"] = now
	case WOStatusPickedUp:
		wo.CompletedAt = &now
		updates["completed_at"] = now
	case WOStatusCancelled:
		wo.CompletedAt = &now
		updates["completed_at"] = now
	}
	if err := s.woRepo.UpdateStatusField(wo.ID, status, updates, orgID, branchID); err != nil {
		return nil, err
	}
	return s.woRepo.FindByID(wo.ID, orgID, branchID)
}

// AddItemInput is a labor line payload.
type AddItemInput struct {
	Name      string  `json:"name"`
	Qty       float64 `json:"qty"`
	UnitPrice float64 `json:"unit_price"`
	EstHours  float64 `json:"est_hours"`
}

// AddItem appends a labor line. When the WO is being worked on, the
// WO moves to menunggu_approval until an admin approves (FR-11).
func (s *WorkOrderService) AddItem(woID uint, input *AddItemInput, actorID, orgID, branchID uint) (*models.WorkOrder, error) {
	if input.Name == "" {
		return nil, ErrMissingFields
	}
	wo, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	if wo.Status == WOStatusDone || wo.Status == WOStatusPickedUp || wo.Status == WOStatusCancelled {
		return nil, ErrWOLocked
	}
	qty := input.Qty
	if qty <= 0 {
		qty = 1
	}
	lineTotal := qty * input.UnitPrice
	needsApproval := wo.Status == WOStatusInProgress
	item := &models.WorkOrderItem{
		WorkOrderID: woID,
		Name:        input.Name,
		Qty:         qty,
		UnitPrice:   input.UnitPrice,
		LineTotal:   lineTotal,
		EstHours:    input.EstHours,
		IsApproved:  !needsApproval,
	}
	if err := s.woRepo.AddItem(item); err != nil {
		return nil, err
	}
	if needsApproval {
		if err := s.woRepo.UpdateStatusField(woID, WOStatusWaitingApproval, nil, orgID, branchID); err != nil {
			return nil, err
		}
	}
	reloaded, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	return s.recalcTotals(reloaded, orgID, branchID)
}

// RemoveItem removes a labor line (only while not locked).
func (s *WorkOrderService) RemoveItem(woID, itemID, orgID, branchID uint) (*models.WorkOrder, error) {
	wo, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	if wo.Status == WOStatusDone || wo.Status == WOStatusPickedUp || wo.Status == WOStatusCancelled {
		return nil, ErrWOLocked
	}
	if err := s.woRepo.RemoveItem(itemID); err != nil {
		return nil, err
	}
	reloaded, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	return s.recalcTotals(reloaded, orgID, branchID)
}

// AddPartInput claims a sparepart on a WO.
type AddPartInput struct {
	SparepartID uint    `json:"sparepart_id"`
	Qty         float64 `json:"qty"`
}

// AddPart claims a part: stock is consumed immediately and, if the WO is
// being worked on, the WO enters menunggu_approval until confirmed.
func (s *WorkOrderService) AddPart(woID uint, input *AddPartInput, actorID, orgID, branchID uint) (*models.WorkOrder, error) {
	if input.SparepartID == 0 || input.Qty <= 0 {
		return nil, ErrMissingFields
	}
	wo, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	if wo.Status == WOStatusDone || wo.Status == WOStatusPickedUp || wo.Status == WOStatusCancelled {
		return nil, ErrWOLocked
	}
	spare, err := s.spareRepo.FindByID(input.SparepartID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if spare == nil {
		return nil, ErrSparepartNotFound
	}
	needsApproval := wo.Status == WOStatusInProgress
	part := &models.WorkOrderPart{
		OrganizationID: orgID,
		BranchID:       branchID,
		WorkOrderID:    woID,
		SparepartID:    input.SparepartID,
		Qty:            input.Qty,
		UnitPrice:      spare.SellPrice,
		LineTotal:      input.Qty * spare.SellPrice,
		IsApproved:     !needsApproval,
		CreatedBy:      actorID,
	}
	if err := s.woRepo.AddPart(part); err != nil {
		return nil, err
	}
	if needsApproval {
		if err := s.woRepo.UpdateStatusField(woID, WOStatusWaitingApproval, nil, orgID, branchID); err != nil {
			return nil, err
		}
	}
	reloaded, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	return s.recalcTotals(reloaded, orgID, branchID)
}

// RemovePart reverses a claimed part (restores stock).
func (s *WorkOrderService) RemovePart(woID, partID, actorID, orgID, branchID uint) (*models.WorkOrder, error) {
	wo, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	if wo.Status == WOStatusDone || wo.Status == WOStatusPickedUp || wo.Status == WOStatusCancelled {
		return nil, ErrWOLocked
	}
	if _, err := s.woRepo.RemovePart(partID, actorID, orgID, branchID); err != nil {
		return nil, err
	}
	reloaded, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	return s.recalcTotals(reloaded, orgID, branchID)
}

// ApproveAdditional approves all pending labor/part lines and returns
// the WO to dikerjakan (FR-11).
func (s *WorkOrderService) ApproveAdditional(woID, orgID, branchID uint) (*models.WorkOrder, error) {
	wo, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	if wo.Status != WOStatusWaitingApproval {
		return nil, errors.New("WO tidak dalam status menunggu_approval")
	}
	if err := s.woRepo.ApprovePending(woID, orgID); err != nil {
		return nil, err
	}
	if err := s.woRepo.UpdateStatusField(woID, WOStatusInProgress, nil, orgID, branchID); err != nil {
		return nil, err
	}
	reloaded, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	return s.recalcTotals(reloaded, orgID, branchID)
}

// RejectAdditional removes pending labor lines and reverses pending part
// claims (stock restored), returning the WO to dikerjakan.
func (s *WorkOrderService) RejectAdditional(woID, actorID, orgID, branchID uint) (*models.WorkOrder, error) {
	wo, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if wo == nil {
		return nil, ErrWONotFound
	}
	if wo.Status != WOStatusWaitingApproval {
		return nil, errors.New("WO tidak dalam status menunggu_approval")
	}
	if err := s.woRepo.RemovePendingItems(woID); err != nil {
		return nil, err
	}
	if err := s.woRepo.RemovePendingParts(woID, actorID, orgID, branchID); err != nil {
		return nil, err
	}
	if err := s.woRepo.UpdateStatusField(woID, WOStatusInProgress, nil, orgID, branchID); err != nil {
		return nil, err
	}
	reloaded, err := s.woRepo.FindByID(woID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	return s.recalcTotals(reloaded, orgID, branchID)
}

// recalcTotals recomputes estimate/actual totals from items + parts and
// persists them. Estimate = sum of labor (by est price) + parts; for MVP
// estimate and actual are kept identical.
func (s *WorkOrderService) recalcTotals(wo *models.WorkOrder, orgID, branchID uint) (*models.WorkOrder, error) {
	var itemTotal, partTotal float64
	for _, it := range wo.Items {
		if it.IsApproved {
			itemTotal += it.LineTotal
		}
	}
	for _, p := range wo.Parts {
		if p.IsApproved {
			partTotal += p.LineTotal
		}
	}
	wo.EstimateTotal = itemTotal + partTotal
	wo.ActualTotal = itemTotal + partTotal
	if err := s.woRepo.Save(wo); err != nil {
		return nil, err
	}
	return s.woRepo.FindByID(wo.ID, orgID, branchID)
}

// WO domain errors.
var (
	ErrWONotFound = errors.New("work order tidak ditemukan")
	ErrWOLocked   = errors.New("WO sudah selesai/diambil/batal dan tidak bisa diubah")
)

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
