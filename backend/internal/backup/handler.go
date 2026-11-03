package backup

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/gofiber/fiber/v2"

	"backend/pkg/middleware"
)

// MaxUploadBytes is the largest archive accepted by POST /import. The Fiber
// app's BodyLimit must be at least this large. (Cloudflare's free plan caps
// request bodies at 100 MB — larger archives can be copied into the
// backups directory on the server and restored from the snapshot list.)
const MaxUploadBytes = 512 << 20

// RequirePlatformSuperadmin allows only the platform superadmin
// (organization 0 + role "superadmin"). Mount AFTER RequireAuth.
func RequirePlatformSuperadmin() fiber.Handler {
	return func(c *fiber.Ctx) error {
		orgID, _ := c.Locals(middleware.CtxOrganizationID).(uint)
		roles, _ := c.Locals(middleware.CtxRoles).([]string)
		if orgID == 0 {
			for _, r := range roles {
				if r == "superadmin" {
					return c.Next()
				}
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden: hanya superadmin platform"})
	}
}

// RegisterRoutes mounts the backup API on r (already authenticated):
//
//	GET    /export                      — download a full backup (.zip)
//	POST   /import                      — restore from an uploaded .zip (field "file")
//	GET    /snapshots                   — list backups stored on the server
//	POST   /snapshots                   — create a backup on the server
//	GET    /snapshots/:name             — download a stored backup
//	POST   /snapshots/:name/restore     — restore from a stored backup
//	DELETE /snapshots/:name             — delete a stored backup
func RegisterRoutes(r fiber.Router, s *Service) {
	r.Use(RequirePlatformSuperadmin())
	r.Get("/export", s.handleExport)
	r.Post("/import", s.handleImport)
	r.Get("/snapshots", s.handleList)
	r.Post("/snapshots", s.handleCreate)
	r.Get("/snapshots/:name", s.handleDownload)
	r.Post("/snapshots/:name/restore", s.handleRestoreSnapshot)
	r.Delete("/snapshots/:name", s.handleDelete)
}

func fail(c *fiber.Ctx, status int, err error) error {
	return c.Status(status).JSON(fiber.Map{"error": err.Error()})
}

func sendFile(c *fiber.Ctx, p, name string, removeAfter bool) error {
	f, err := os.Open(p)
	if err != nil {
		return fail(c, fiber.StatusInternalServerError, err)
	}
	fi, err := f.Stat()
	if err != nil {
		f.Close()
		return fail(c, fiber.StatusInternalServerError, err)
	}
	if removeAfter {
		os.Remove(p) // unlinked; the open handle keeps the data until sent
	}
	c.Set(fiber.HeaderContentType, "application/zip")
	c.Set(fiber.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="%s"`, name))
	c.Set(fiber.HeaderCacheControl, "no-store")
	c.Set("Access-Control-Expose-Headers", "Content-Disposition, Content-Length")
	return c.SendStream(f, int(fi.Size())) // fasthttp closes f when done
}

func (s *Service) handleExport(c *fiber.Ctx) error {
	p, err := s.ExportToTemp()
	if err != nil {
		return fail(c, fiber.StatusInternalServerError, fmt.Errorf("export gagal: %w", err))
	}
	return sendFile(c, p, s.FileName(time.Now()), true)
}

func (s *Service) handleImport(c *fiber.Ctx) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return fail(c, fiber.StatusBadRequest, fmt.Errorf("file backup (.zip) wajib diunggah"))
	}
	if fh.Size > MaxUploadBytes {
		return fail(c, fiber.StatusRequestEntityTooLarge, fmt.Errorf("file terlalu besar (maks %d MB)", MaxUploadBytes>>20))
	}
	tmp, err := os.CreateTemp("", s.app+"-import-*.zip")
	if err != nil {
		return fail(c, fiber.StatusInternalServerError, err)
	}
	tmp.Close()
	defer os.Remove(tmp.Name())
	if err := c.SaveFile(fh, tmp.Name()); err != nil {
		return fail(c, fiber.StatusInternalServerError, err)
	}
	res, err := s.Restore(tmp.Name())
	if err != nil {
		return fail(c, fiber.StatusUnprocessableEntity, fmt.Errorf("import gagal: %w", err))
	}
	return c.JSON(res)
}

func (s *Service) handleList(c *fiber.Ctx) error {
	list, err := s.ListSnapshots()
	if err != nil {
		return fail(c, fiber.StatusInternalServerError, err)
	}
	return c.JSON(fiber.Map{"data": list, "dir": filepath.Clean(s.backupsDir)})
}

func (s *Service) handleCreate(c *fiber.Ctx) error {
	sn, err := s.CreateSnapshot()
	if err != nil {
		return fail(c, fiber.StatusInternalServerError, fmt.Errorf("backup gagal: %w", err))
	}
	return c.Status(fiber.StatusCreated).JSON(sn)
}

func (s *Service) handleDownload(c *fiber.Ctx) error {
	name := c.Params("name")
	p, err := s.SnapshotPath(name)
	if err != nil {
		return fail(c, fiber.StatusNotFound, err)
	}
	return sendFile(c, p, name, false)
}

func (s *Service) handleRestoreSnapshot(c *fiber.Ctx) error {
	p, err := s.SnapshotPath(c.Params("name"))
	if err != nil {
		return fail(c, fiber.StatusNotFound, err)
	}
	// Restore writes a new pre-restore snapshot and may prune old ones —
	// work on a copy so the source can't be pruned mid-restore.
	tmp, err := os.CreateTemp("", s.app+"-restore-*.zip")
	if err != nil {
		return fail(c, fiber.StatusInternalServerError, err)
	}
	defer os.Remove(tmp.Name())
	src, err := os.Open(p)
	if err != nil {
		tmp.Close()
		return fail(c, fiber.StatusInternalServerError, err)
	}
	_, err = tmp.ReadFrom(src)
	src.Close()
	tmp.Close()
	if err != nil {
		return fail(c, fiber.StatusInternalServerError, err)
	}
	res, err := s.Restore(tmp.Name())
	if err != nil {
		return fail(c, fiber.StatusUnprocessableEntity, fmt.Errorf("restore gagal: %w", err))
	}
	return c.JSON(res)
}

func (s *Service) handleDelete(c *fiber.Ctx) error {
	if err := s.DeleteSnapshot(c.Params("name")); err != nil {
		return fail(c, fiber.StatusNotFound, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}
