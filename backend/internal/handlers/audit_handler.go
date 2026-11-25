package handlers

import (
	"bytes"
	"encoding/json"
	"log"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/middleware"
)

// AuditHandler writes the audit trail (Middleware) and serves it (List).
type AuditHandler struct {
	repo *repository.AuditRepository
}

// NewAuditHandler wires the dependency.
func NewAuditHandler(repo *repository.AuditRepository) *AuditHandler {
	return &AuditHandler{repo: repo}
}

const (
	auditMaxBody   = 64 << 10 // request bodies above this are not inspected
	auditMaxDetail = 4000
)

// Middleware records an audit entry after the request has been handled:
//
//   - every successful change (POST/PUT/PATCH/DELETE under /api),
//   - every successful data export (GET …/export),
//   - every login attempt, successful or not.
//
// Failed changes (validation errors, forbidden, …) changed nothing and
// are not recorded. A failure to write the entry never fails the request.
func (h *AuditHandler) Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		err := c.Next()

		path := c.Path()
		if !strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/api/public/") {
			return err
		}
		method := c.Method()
		segments := strings.Split(strings.Trim(strings.TrimPrefix(path, "/api/"), "/"), "/")
		last := segments[len(segments)-1]
		isExport := method == fiber.MethodGet && last == "export"
		isChange := method == fiber.MethodPost || method == fiber.MethodPut ||
			method == fiber.MethodPatch || method == fiber.MethodDelete
		if !isExport && !isChange {
			return err
		}
		status := c.Response().StatusCode()
		if e, ok := err.(*fiber.Error); ok {
			status = e.Code
		} else if err != nil {
			status = fiber.StatusInternalServerError
		}
		isLogin := path == "/api/auth/login"
		if status >= 400 && !isLogin {
			return err
		}

		entry := &models.AuditLog{
			Resource: segments[0],
			Method:   method,
			Path:     truncate(path, 255),
			Status:   status,
			IP:       c.IP(),
		}
		// Action: a trailing word in the path (import, invite, login, …)
		// names it; otherwise the HTTP method does.
		switch {
		case len(segments) > 1 && !isNumeric(last):
			entry.Action = last
		case method == fiber.MethodPost:
			entry.Action = "create"
		case method == fiber.MethodDelete:
			entry.Action = "delete"
		default:
			entry.Action = "update"
		}
		for _, s := range segments[1:] {
			if isNumeric(s) {
				id, _ := strconv.ParseUint(s, 10, 64)
				entry.ResourceID = uint(id)
				break
			}
		}

		body := requestBody(c)
		entry.Detail = redact(body)
		if isExport {
			entry.Detail = string(c.Request().URI().QueryString())
		}

		if uid, ok := middleware.ActorUserID(c); ok && uid > 0 {
			orgID, _ := middleware.ActorOrgID(c)
			actor := h.repo.Actor(uid)
			entry.UserID, entry.OrganizationID = uid, orgID
			entry.UserName, entry.UserEmail = actor.Name, actor.Email
		} else if email := jsonString(body, "email"); email != "" {
			// Unauthenticated endpoints (login, register, forgot password):
			// attribute the entry to the account the email belongs to.
			uid, actor := h.repo.ActorByEmail(email)
			entry.UserID, entry.OrganizationID = uid, actor.OrganizationID
			entry.UserName, entry.UserEmail = actor.Name, email
		}
		if isLogin && status >= 400 {
			entry.Action = "login_failed"
		}
		// A create answers with the new record: keep its id.
		if entry.Action == "create" && entry.ResourceID == 0 {
			var created struct {
				ID uint `json:"id"`
			}
			if json.Unmarshal(c.Response().Body(), &created) == nil {
				entry.ResourceID = created.ID
			}
		}

		if werr := h.repo.Create(entry); werr != nil {
			log.Printf("[audit] gagal mencatat %s %s: %v", method, path, werr)
		}
		return err
	}
}

// requestBody returns the JSON request body, or nil for uploads and
// oversized bodies.
func requestBody(c *fiber.Ctx) []byte {
	if !strings.HasPrefix(c.Get(fiber.HeaderContentType), fiber.MIMEApplicationJSON) {
		return nil
	}
	body := c.Body()
	if len(body) == 0 || len(body) > auditMaxBody {
		return nil
	}
	return body
}

// redact renders a JSON body for the audit detail with secrets removed.
func redact(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var data any
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	if dec.Decode(&data) != nil {
		return ""
	}
	out, err := json.Marshal(redactValue(data))
	if err != nil {
		return ""
	}
	return truncate(string(out), auditMaxDetail)
}

func redactValue(v any) any {
	switch t := v.(type) {
	case map[string]any:
		for k, val := range t {
			lk := strings.ToLower(k)
			if strings.Contains(lk, "password") || strings.Contains(lk, "token") ||
				strings.Contains(lk, "secret") || strings.Contains(lk, "credential") {
				t[k] = "***"
				continue
			}
			t[k] = redactValue(val)
		}
	case []any:
		for i := range t {
			t[i] = redactValue(t[i])
		}
	}
	return v
}

func jsonString(body []byte, key string) string {
	if len(body) == 0 {
		return ""
	}
	var m map[string]any
	if json.Unmarshal(body, &m) != nil {
		return ""
	}
	s, _ := m[key].(string)
	return strings.TrimSpace(s)
}

func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// List handles GET /api/audit-logs with optional filters: from, to,
// resource, action, user_id, q, page, page_size.
func (h *AuditHandler) List(c *fiber.Ctx) error {
	orgID, _ := middleware.ActorOrgID(c)
	f := repository.AuditFilter{
		From:     c.Query("from"),
		To:       c.Query("to"),
		Resource: c.Query("resource"),
		Action:   c.Query("action"),
		UserID:   parseUintQuery(c, "user_id"),
		Search:   strings.TrimSpace(c.Query("q")),
		Page:     c.QueryInt("page", 1),
		PageSize: c.QueryInt("page_size", 25),
	}
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 200 {
		f.PageSize = 25
	}
	for _, d := range []string{f.From, f.To} {
		if d != "" && !isISODate(d) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "format tanggal harus YYYY-MM-DD"})
		}
	}
	logs, total, err := h.repo.List(orgID, f)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"logs": logs, "total": total, "page": f.Page, "page_size": f.PageSize})
}

func isISODate(s string) bool {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return false
	}
	return isNumeric(s[:4]) && isNumeric(s[5:7]) && isNumeric(s[8:])
}
