package handlers

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
	"backend/pkg/middleware"
)

// CustomerHandler exposes CRUD over customers & vehicles.
type CustomerHandler struct {
	custService *service.CustomerService
}

// NewCustomerHandler wires the dependency.
func NewCustomerHandler(custService *service.CustomerService) *CustomerHandler {
	return &CustomerHandler{custService: custService}
}

// ListCustomers handles GET /api/customers?q=...
func (h *CustomerHandler) ListCustomers(c *fiber.Ctx) error {
	q := c.Query("q")
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	customers, err := h.custService.SearchCustomers(q, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"customers": customers})
}

// GetCustomer handles GET /api/customers/:id
func (h *CustomerHandler) GetCustomer(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid customer id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	customer, err := h.custService.GetCustomer(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if customer == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrCustomerNotFound.Error()})
	}
	return c.JSON(customer)
}

// GetCustomerByPhone handles GET /api/customers/phone/:phone (exact match,
// used by xlsx import to match customers by their unique phone number).
func (h *CustomerHandler) GetCustomerByPhone(c *fiber.Ctx) error {
	phone := c.Params("phone")
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	customer, err := h.custService.GetCustomerByPhone(phone, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if customer == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "pelanggan tidak ditemukan"})
	}
	return c.JSON(customer)
}

// CreateCustomer handles POST /api/customers
func (h *CustomerHandler) CreateCustomer(c *fiber.Ctx) error {
	var input service.CreateCustomerInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	customer, err := h.custService.CreateCustomer(&input, orgID, branchID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMissingFields):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrPhoneTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(customer)
}

// UpdateCustomer handles PUT /api/customers/:id
func (h *CustomerHandler) UpdateCustomer(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid customer id"})
	}
	var input service.UpdateCustomerInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	customer, err := h.custService.UpdateCustomer(uint(id), orgID, branchID, &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrCustomerNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrPhoneTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(customer)
}

// DeleteCustomer handles DELETE /api/customers/:id
func (h *CustomerHandler) DeleteCustomer(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid customer id"})
	}
	if err := h.custService.DeleteCustomer(uint(id)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// ─── Vehicles ───────────────────────────────────────────────────────────────────

// CreateVehicle handles POST /api/vehicles
func (h *CustomerHandler) CreateVehicle(c *fiber.Ctx) error {
	var input service.CreateVehicleInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	vehicle, err := h.custService.CreateVehicle(&input, orgID, branchID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMissingFields):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrCustomerNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(vehicle)
}

// GetVehicle handles GET /api/vehicles/:id
func (h *CustomerHandler) GetVehicle(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid vehicle id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	vehicle, err := h.custService.GetVehicle(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if vehicle == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrVehicleNotFound.Error()})
	}
	return c.JSON(vehicle)
}

// FindVehicleByPlate handles GET /api/vehicles/plate/:plate
func (h *CustomerHandler) FindVehicleByPlate(c *fiber.Ctx) error {
	plate := c.Params("plate")
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	vehicle, err := h.custService.FindVehicleByPlate(plate, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if vehicle == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "kendaraan tidak ditemukan"})
	}
	return c.JSON(vehicle)
}

// UpdateVehicle handles PUT /api/vehicles/:id
func (h *CustomerHandler) UpdateVehicle(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid vehicle id"})
	}
	var input service.UpdateVehicleInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	vehicle, err := h.custService.UpdateVehicle(uint(id), orgID, branchID, &input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrVehicleNotFound):
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		case isPlateTaken(err):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.JSON(vehicle)
}

// isPlateTaken reports whether err is the duplicate-plate conflict.
// The service returns a formatted error (ErrPlateTaken) rather than a
// sentinel, so we match on the stable message prefix.
func isPlateTaken(err error) bool {
	return err != nil && strings.HasPrefix(err.Error(), "plat nomor ") && strings.HasSuffix(err.Error(), "sudah terdaftar")
}

// DeleteVehicle handles DELETE /api/vehicles/:id
func (h *CustomerHandler) DeleteVehicle(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid vehicle id"})
	}
	if err := h.custService.DeleteVehicle(uint(id)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}
