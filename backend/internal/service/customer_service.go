package service

import (
	"errors"
	"fmt"
	"strings"

	"backend/internal/models"
	"backend/internal/repository"
)

// CustomerService handles business logic for customers & vehicles.
type CustomerService struct {
	custRepo *repository.CustomerRepository
}

// NewCustomerService wires the dependency.
func NewCustomerService(custRepo *repository.CustomerRepository) *CustomerService {
	return &CustomerService{custRepo: custRepo}
}

// CreateCustomerInput is the payload for registering a new customer.
type CreateCustomerInput struct {
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
	Address string `json:"address"`
	Notes   string `json:"notes"`
}

// CreateCustomer registers a new customer. Phone is mandatory and must be unique.
func (s *CustomerService) CreateCustomer(input *CreateCustomerInput, orgID, branchID uint) (*models.Customer, error) {
	if input.Name == "" || input.Phone == "" {
		return nil, ErrMissingFields
	}
	existing, err := s.custRepo.FindByPhone(input.Phone, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrPhoneTaken
	}
	customer := &models.Customer{
		OrganizationID: orgID,
		BranchID:       branchID,
		Name:           input.Name,
		Phone:          input.Phone,
		Email:          input.Email,
		Address:        input.Address,
		Notes:          input.Notes,
	}
	if err := s.custRepo.Create(customer); err != nil {
		// Safety net for races: two concurrent creates with the same phone
		// can both pass the FindByPhone pre-check, then one INSERT hits the
		// per-org partial unique index (SQLSTATE 23505).
		if strings.Contains(err.Error(), "SQLSTATE 23505") || strings.Contains(err.Error(), "duplicate key") {
			return nil, ErrPhoneTaken
		}
		return nil, err
	}
	return customer, nil
}

// ListCustomers returns all customers in the organization.
func (s *CustomerService) ListCustomers(orgID, branchID uint) ([]models.Customer, error) {
	return s.custRepo.FindAll(orgID, branchID)
}

// SearchCustomers searches by name or phone within the organization.
func (s *CustomerService) SearchCustomers(q string, orgID, branchID uint) ([]models.Customer, error) {
	if q == "" {
		return s.custRepo.FindAll(orgID, branchID)
	}
	return s.custRepo.Search(q, orgID, branchID)
}

// GetCustomer returns a single customer with vehicles.
func (s *CustomerService) GetCustomer(id, orgID, branchID uint) (*models.Customer, error) {
	return s.custRepo.FindByID(id, orgID, branchID)
}

// GetCustomerByPhone returns a customer by exact phone number (import matching).
func (s *CustomerService) GetCustomerByPhone(phone string, orgID, branchID uint) (*models.Customer, error) {
	if phone == "" {
		return nil, ErrCustomerNotFound
	}
	return s.custRepo.FindByPhone(phone, orgID, branchID)
}

// UpdateCustomerInput is the payload for editing a customer.
type UpdateCustomerInput struct {
	Name    string `json:"name,omitempty"`
	Phone   string `json:"phone,omitempty"`
	Email   string `json:"email,omitempty"`
	Address string `json:"address,omitempty"`
	Notes   string `json:"notes,omitempty"`
}

// UpdateCustomer applies changes to a customer.
func (s *CustomerService) UpdateCustomer(id, orgID, branchID uint, input *UpdateCustomerInput) (*models.Customer, error) {
	customer, err := s.custRepo.FindByID(id, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if customer == nil {
		return nil, ErrCustomerNotFound
	}
	if input.Name != "" {
		customer.Name = input.Name
	}
	if input.Phone != "" {
		if input.Phone != customer.Phone {
			existing, err := s.custRepo.FindByPhone(input.Phone, orgID, branchID)
			if err != nil {
				return nil, err
			}
			if existing != nil && existing.ID != customer.ID {
				return nil, ErrPhoneTaken
			}
		}
		customer.Phone = input.Phone
	}
	if input.Email != "" {
		customer.Email = input.Email
	}
	if input.Address != "" {
		customer.Address = input.Address
	}
	if input.Notes != "" {
		customer.Notes = input.Notes
	}
	if err := s.custRepo.Update(customer); err != nil {
		return nil, err
	}
	return customer, nil
}

// DeleteCustomer soft-deletes a customer.
func (s *CustomerService) DeleteCustomer(id uint) error {
	return s.custRepo.Delete(id)
}

// ─── Vehicles ───────────────────────────────────────────────────────────────────

// CreateVehicleInput is the payload for registering a vehicle.
type CreateVehicleInput struct {
	CustomerID uint   `json:"customer_id"`
	Brand      string `json:"brand"`
	Model      string `json:"model"`
	Year       int    `json:"year"`
	Plate      string `json:"plate"`
	VIN        string `json:"vin"`
	Type       string `json:"type"`
	Color      string `json:"color"`
	LastKM     int    `json:"last_km"`
}

// CreateVehicle registers a new vehicle. Plate must be unique in the org.
func (s *CustomerService) CreateVehicle(input *CreateVehicleInput, orgID, branchID uint) (*models.Vehicle, error) {
	if input.Brand == "" || input.Plate == "" {
		return nil, ErrMissingFields
	}
	// Verify customer exists in the same org
	cust, err := s.custRepo.FindByID(input.CustomerID, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if cust == nil {
		return nil, ErrCustomerNotFound
	}
	existing, err := s.custRepo.FindVehicleByPlate(input.Plate, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("plat nomor %s sudah terdaftar", input.Plate)
	}
	vehicle := &models.Vehicle{
		OrganizationID: orgID,
		BranchID:       branchID,
		CustomerID:     input.CustomerID,
		Brand:          input.Brand,
		Model:          input.Model,
		Year:           input.Year,
		Plate:          input.Plate,
		VIN:            input.VIN,
		Type:           input.Type,
		Color:          input.Color,
		LastKM:         input.LastKM,
	}
	if err := s.custRepo.CreateVehicle(vehicle); err != nil {
		// Race safety net, same rationale as CreateCustomer above.
		if strings.Contains(err.Error(), "SQLSTATE 23505") || strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("plat nomor %s sudah terdaftar", input.Plate)
		}
		return nil, err
	}
	return vehicle, nil
}

// GetVehicle returns a single vehicle with its customer.
func (s *CustomerService) GetVehicle(id, orgID, branchID uint) (*models.Vehicle, error) {
	return s.custRepo.FindVehicleByID(id, orgID, branchID)
}

// FindVehicleByPlate looks up a vehicle by plate number.
func (s *CustomerService) FindVehicleByPlate(plate string, orgID, branchID uint) (*models.Vehicle, error) {
	return s.custRepo.FindVehicleByPlate(plate, orgID, branchID)
}

// UpdateVehicleInput is the payload for editing a vehicle.
type UpdateVehicleInput struct {
	Brand  string `json:"brand,omitempty"`
	Model  string `json:"model,omitempty"`
	Year   int    `json:"year,omitempty"`
	Plate  string `json:"plate,omitempty"`
	VIN    string `json:"vin,omitempty"`
	Type   string `json:"type,omitempty"`
	Color  string `json:"color,omitempty"`
	LastKM int    `json:"last_km,omitempty"`
}

// UpdateVehicle applies changes to a vehicle.
func (s *CustomerService) UpdateVehicle(id, orgID, branchID uint, input *UpdateVehicleInput) (*models.Vehicle, error) {
	vehicle, err := s.custRepo.FindVehicleByID(id, orgID, branchID)
	if err != nil {
		return nil, err
	}
	if vehicle == nil {
		return nil, ErrVehicleNotFound
	}
	if input.Brand != "" {
		vehicle.Brand = input.Brand
	}
	if input.Model != "" {
		vehicle.Model = input.Model
	}
	if input.Year > 0 {
		vehicle.Year = input.Year
	}
	// Plate pre-check: without this, updating to a plate that already
	// exists in the org hits the partial unique index and returns a raw
	// 500 instead of a meaningful conflict.
	if input.Plate != "" && input.Plate != vehicle.Plate {
		existing, err := s.custRepo.FindVehicleByPlate(input.Plate, orgID, branchID)
		if err != nil {
			return nil, err
		}
		if existing != nil && existing.ID != vehicle.ID {
			return nil, ErrPlateTaken(input.Plate)
		}
	}
	if input.Plate != "" {
		vehicle.Plate = input.Plate
	}
	if input.VIN != "" {
		vehicle.VIN = input.VIN
	}
	if input.Type != "" {
		vehicle.Type = input.Type
	}
	if input.Color != "" {
		vehicle.Color = input.Color
	}
	if input.LastKM > 0 {
		vehicle.LastKM = input.LastKM
	}
	if err := s.custRepo.UpdateVehicle(vehicle); err != nil {
		return nil, err
	}
	return vehicle, nil
}

// DeleteVehicle soft-deletes a vehicle.
func (s *CustomerService) DeleteVehicle(id uint) error {
	return s.custRepo.DeleteVehicle(id)
}

// Domain errors.
var (
	ErrMissingFields    = errors.New("nama dan nomor telepon wajib diisi")
	ErrPhoneTaken       = errors.New("nomor telepon sudah terdaftar")
	ErrCustomerNotFound = errors.New("pelanggan tidak ditemukan")
	ErrVehicleNotFound  = errors.New("kendaraan tidak ditemukan")
)

// ErrPlateTaken builds the duplicate-plate conflict error.
func ErrPlateTaken(plate string) error {
	return fmt.Errorf("plat nomor %s sudah terdaftar", plate)
}
