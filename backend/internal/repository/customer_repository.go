package repository

import (
	"errors"

	"gorm.io/gorm"

	"backend/internal/models"
)

// CustomerRepository handles database operations for customers + vehicles.
// Every query is scoped to an organization (orgID=0 = superadmin, sees all).
type CustomerRepository struct {
	db *gorm.DB
}

// NewCustomerRepository creates a new CustomerRepository.
func NewCustomerRepository(db *gorm.DB) *CustomerRepository {
	return &CustomerRepository{db: db}
}

// Create inserts a new customer.
func (r *CustomerRepository) Create(customer *models.Customer) error {
	return r.db.Create(customer).Error
}

// FindByID looks up a customer with vehicles loaded, scoped by org + branch.
func (r *CustomerRepository) FindByID(id, orgID, branchID uint) (*models.Customer, error) {
	var customer models.Customer
	err := scopeBranch(r.db, orgID, branchID).Preload("Vehicles").First(&customer, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &customer, nil
}

// FindByPhone looks up a customer by unique phone number, scoped by org + branch.
func (r *CustomerRepository) FindByPhone(phone string, orgID, branchID uint) (*models.Customer, error) {
	var customer models.Customer
	err := scopeBranch(r.db, orgID, branchID).Where("phone = ?", phone).First(&customer).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &customer, nil
}

// FindAll returns all customers with their vehicles, newest first.
func (r *CustomerRepository) FindAll(orgID, branchID uint) ([]models.Customer, error) {
	var customers []models.Customer
	err := scopeBranch(r.db, orgID, branchID).Preload("Vehicles").Order("id DESC").Find(&customers).Error
	return customers, err
}

// Search returns customers whose name or phone matches the query.
func (r *CustomerRepository) Search(q string, orgID, branchID uint) ([]models.Customer, error) {
	var customers []models.Customer
	like := "%" + q + "%"
	err := scopeBranch(r.db, orgID, branchID).
		Where("name ILIKE ? OR phone ILIKE ?", like, like).
		Order("id DESC").Limit(50).Find(&customers).Error
	return customers, err
}

// Update saves field changes on a customer.
func (r *CustomerRepository) Update(customer *models.Customer) error {
	return r.db.Save(customer).Error
}

// Delete soft-deletes a customer.
func (r *CustomerRepository) Delete(id uint) error {
	return r.db.Delete(&models.Customer{}, id).Error
}

// CreateVehicle inserts a new vehicle under a customer.
func (r *CustomerRepository) CreateVehicle(vehicle *models.Vehicle) error {
	return r.db.Create(vehicle).Error
}

// FindVehicleByID looks up a vehicle with its customer loaded, scoped by org + branch.
func (r *CustomerRepository) FindVehicleByID(id, orgID, branchID uint) (*models.Vehicle, error) {
	var vehicle models.Vehicle
	err := scopeBranch(r.db, orgID, branchID).Preload("Customer").First(&vehicle, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &vehicle, nil
}

// FindVehicleByPlate looks up a vehicle by unique plate number, scoped by org + branch.
func (r *CustomerRepository) FindVehicleByPlate(plate string, orgID, branchID uint) (*models.Vehicle, error) {
	var vehicle models.Vehicle
	err := scopeBranch(r.db, orgID, branchID).Where("plate = ?", plate).First(&vehicle).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &vehicle, nil
}

// FindVehiclesByCustomer returns all vehicles for a customer.
func (r *CustomerRepository) FindVehiclesByCustomer(customerID, orgID, branchID uint) ([]models.Vehicle, error) {
	var vehicles []models.Vehicle
	err := scopeBranch(r.db, orgID, branchID).Where("customer_id = ?", customerID).Order("id DESC").Find(&vehicles).Error
	return vehicles, err
}

// UpdateVehicle saves field changes on a vehicle.
func (r *CustomerRepository) UpdateVehicle(vehicle *models.Vehicle) error {
	return r.db.Save(vehicle).Error
}

// DeleteVehicle soft-deletes a vehicle.
func (r *CustomerRepository) DeleteVehicle(id uint) error {
	return r.db.Delete(&models.Vehicle{}, id).Error
}
