package handlers

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"backend/internal/repository"
	"backend/pkg/middleware"
	"backend/internal/service"
)

// SparepartHandler exposes sparepart catalog + stock management.
type SparepartHandler struct {
	spareService *service.SparepartService
}

// NewSparepartHandler wires the dependency.
func NewSparepartHandler(spareService *service.SparepartService) *SparepartHandler {
	return &SparepartHandler{spareService: spareService}
}

// ListSpareparts handles GET /api/spareparts?q=...
func (h *SparepartHandler) ListSpareparts(c *fiber.Ctx) error {
	q := c.Query("q")
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	parts, err := h.spareService.SearchSpareparts(q, orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"spareparts": parts})
}

// LowStock handles GET /api/spareparts/low-stock
func (h *SparepartHandler) LowStock(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	parts, err := h.spareService.LowStock(orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"spareparts": parts})
}

// GetSparepart handles GET /api/spareparts/:id
func (h *SparepartHandler) GetSparepart(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sparepart id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	part, err := h.spareService.GetSparepart(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if part == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrSparepartNotFound.Error()})
	}
	return c.JSON(part)
}

// CreateSparepart handles POST /api/spareparts
func (h *SparepartHandler) CreateSparepart(c *fiber.Ctx) error {
	var input service.CreateSparepartInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	part, err := h.spareService.CreateSparepart(&input, orgID, branchID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMissingFields):
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		case errors.Is(err, service.ErrSKUTaken):
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		default:
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}
	return c.Status(fiber.StatusCreated).JSON(part)
}

// UpdateSparepart handles PUT /api/spareparts/:id
func (h *SparepartHandler) UpdateSparepart(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sparepart id"})
	}
	var input service.UpdateSparepartInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	part, err := h.spareService.UpdateSparepart(uint(id), orgID, branchID, &input)
	if err != nil {
		if errors.Is(err, service.ErrSparepartNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(part)
}

// DeleteSparepart handles DELETE /api/spareparts/:id
func (h *SparepartHandler) DeleteSparepart(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sparepart id"})
	}
	if err := h.spareService.DeleteSparepart(uint(id)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// StockHistory handles GET /api/spareparts/:id/stock-history
func (h *SparepartHandler) StockHistory(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sparepart id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	txs, err := h.spareService.StockHistory(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"transactions": txs})
}

// UploadImage handles POST /api/spareparts/:id/image (multipart).
func (h *SparepartHandler) UploadImage(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sparepart id"})
	}
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)

	part, err := h.spareService.GetSparepart(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if part == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": service.ErrSparepartNotFound.Error()})
	}

	file, err := c.FormFile("image")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file image diperlukan"})
	}

	// Validate size (max 2MB)
	if file.Size > 2*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file maksimal 2MB"})
	}

	// Validate type
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "format file harus PNG/JPG/WebP"})
	}

	// Create uploads dir
	uploadDir := "uploads/spareparts"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "gagal membuat direktori upload"})
	}

	// Hapus gambar lama (jika ada) sebelum menyimpan yang baru — hanya file
	// di dalam uploadDir, dan hanya milik sparepart ini, agar tidak path-traversal.
	if part.ImageURL != "" {
		if oldName := filepath.Base(part.ImageURL); oldName != "." && oldName != "/" {
			oldPath := filepath.Join(uploadDir, oldName)
			if strings.HasPrefix(oldPath, uploadDir+string(os.PathSeparator)) {
				_ = os.Remove(oldPath)
			}
		}
	}

	filename := fmt.Sprintf("%d-%d%s", id, time.Now().UnixMilli(), ext)
	dest := filepath.Join(uploadDir, filename)
	if err := c.SaveFile(file, dest); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "gagal menyimpan file"})
	}

	imageURL := "/uploads/spareparts/" + filename
	if err := h.spareService.UpdateImageURL(uint(id), orgID, branchID, imageURL); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	part.ImageURL = imageURL
	return c.JSON(part)
}
func (h *SparepartHandler) AdjustStock(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid sparepart id"})
	}
	var input service.StockAdjustInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	input.SparepartID = uint(id)
	actorID, ok := middleware.ActorUserID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing actor id"})
	}
	input.CreatedBy = actorID
	orgID, _ := middleware.ActorOrgID(c)
	branchID, _ := middleware.ActorBranchID(c)
	if err := h.spareService.AdjustStock(&input, orgID, branchID); err != nil {
		if errors.Is(err, repository.ErrInsufficientStock) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "stok tidak mencukupi"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	part, err := h.spareService.GetSparepart(uint(id), orgID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(part)
}
