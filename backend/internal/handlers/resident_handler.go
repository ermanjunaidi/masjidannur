package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
)

// ResidentHandler exposes the resident list (daftar warga): CRUD plus
// Excel export, template and import.
type ResidentHandler struct {
	residents *service.ResidentService
	settings  *service.MasjidSettingsService
}

// NewResidentHandler wires the dependencies.
func NewResidentHandler(residents *service.ResidentService, settings *service.MasjidSettingsService) *ResidentHandler {
	return &ResidentHandler{residents: residents, settings: settings}
}

func residentError(c *fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	switch {
	case errors.Is(err, service.ErrRecipientRequired), errors.Is(err, service.ErrImportInvalidFile),
		errors.Is(err, service.ErrImportNoHeader), errors.Is(err, service.ErrImportTooManyRows),
		errors.Is(err, service.ErrImportTooLarge):
		status = fiber.StatusBadRequest
	case errors.Is(err, service.ErrResidentNotFound):
		status = fiber.StatusNotFound
	case errors.Is(err, service.ErrResidentExists):
		status = fiber.StatusConflict
	}
	return c.Status(status).JSON(fiber.Map{"error": err.Error()})
}

func sendExcel(c *fiber.Ctx, file *service.ExportFile) error {
	c.Set(fiber.HeaderContentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="`+file.Name+`"`)
	return c.Send(file.Data)
}

// List handles GET /api/residents
func (h *ResidentHandler) List(c *fiber.Ctx) error {
	list, err := h.residents.List(scopeFrom(c))
	if err != nil {
		return residentError(c, err)
	}
	return c.JSON(fiber.Map{"residents": list})
}

// Create handles POST /api/residents
func (h *ResidentHandler) Create(c *fiber.Ctx) error {
	var input service.ResidentInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	res, err := h.residents.Create(scopeFrom(c), &input)
	if err != nil {
		return residentError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// Update handles PUT /api/residents/:id
func (h *ResidentHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid resident id"})
	}
	var input service.ResidentInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	res, err := h.residents.Update(scopeFrom(c), uint(id), &input)
	if err != nil {
		return residentError(c, err)
	}
	return c.JSON(res)
}

// Delete handles DELETE /api/residents/:id
func (h *ResidentHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid resident id"})
	}
	if err := h.residents.Delete(scopeFrom(c), uint(id)); err != nil {
		return residentError(c, err)
	}
	return c.JSON(fiber.Map{"deleted": uint(id)})
}

// Export handles GET /api/residents/export
func (h *ResidentHandler) Export(c *fiber.Ctx) error {
	sc := scopeFrom(c)
	masjid, _ := h.settings.GetSettings(sc.OrgID)
	file, err := h.residents.Export(sc, masjid)
	if err != nil {
		return residentError(c, err)
	}
	return sendExcel(c, file)
}

// Template handles GET /api/residents/template
func (h *ResidentHandler) Template(c *fiber.Ctx) error {
	masjid, _ := h.settings.GetSettings(scopeFrom(c).OrgID)
	file, err := h.residents.Template(masjid)
	if err != nil {
		return residentError(c, err)
	}
	return sendExcel(c, file)
}

// Import handles POST /api/residents/import (multipart field "file").
func (h *ResidentHandler) Import(c *fiber.Ctx) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "pilih file Excel (.xlsx) untuk di-import"})
	}
	if fh.Size > service.MaxResidentImportBytes {
		return residentError(c, service.ErrImportTooLarge)
	}
	file, err := fh.Open()
	if err != nil {
		return residentError(c, service.ErrImportInvalidFile)
	}
	defer file.Close()
	result, err := h.residents.Import(scopeFrom(c), file)
	if err != nil {
		return residentError(c, err)
	}
	return c.JSON(result)
}
