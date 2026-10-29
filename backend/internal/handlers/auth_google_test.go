package handlers

import (
	"io"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"

	"backend/internal/service"
)

func TestResolveOrigin(t *testing.T) {
	h := NewAuthHandler(nil, nil, "https://app.example.com", []string{"*", "https://admin.other.org/"}, "example.com")
	cases := map[string]string{
		"https://app.example.com":           "https://app.example.com",
		"https://app.example.com/login?x=1": "https://app.example.com",
		"https://example.com":               "https://example.com",
		"https://api.shop.example.com":      "https://api.shop.example.com",
		"http://localhost:5173":             "http://localhost:5173",
		"http://127.0.0.1:5174/register":    "http://127.0.0.1:5174",
		"https://admin.other.org":           "https://admin.other.org",
		"https://evil.com":                  "",
		"https://example.com.evil.com":      "",
		"https://evilexample.com":           "",
		"javascript:alert(1)":               "",
		"//example.com":                     "",
		"":                                  "",
	}
	for in, want := range cases {
		if got := h.resolveOrigin(in); got != want {
			t.Errorf("resolveOrigin(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestOAuthStateSingleUse(t *testing.T) {
	s := newOAuthStateStore()
	s.put("abc", "http://localhost:5173", googleModeRegister)
	if o, m, ok := s.consume("abc"); !ok || o != "http://localhost:5173" || m != googleModeRegister {
		t.Fatalf("first consume = %q %q %v", o, m, ok)
	}
	if _, _, ok := s.consume("abc"); ok {
		t.Fatal("state reused")
	}
	if _, _, ok := s.consume(""); ok {
		t.Fatal("empty state accepted")
	}
}

func TestParseGoogleMode(t *testing.T) {
	for in, want := range map[string]string{
		"register": googleModeRegister,
		"login":    googleModeLogin,
		"":         googleModeLogin,
		"REGISTER": googleModeLogin,
		"x":        googleModeLogin,
	} {
		if got := parseGoogleMode(in); got != want {
			t.Errorf("parseGoogleMode(%q) = %q, want %q", in, got, want)
		}
	}
}

func newGoogleTestApp(clientID string) *fiber.App {
	svc := service.NewAuthService(nil, nil, "secret", nil, clientID, "client-secret", "", service.SMTPConfig{}, "https://app.example.com")
	h := NewAuthHandler(svc, nil, "https://app.example.com", nil, "example.com")
	app := fiber.New()
	app.Get("/api/auth/google", h.GoogleAuth)
	app.Get("/api/auth/google/callback", h.GoogleCallback)
	app.Get("/api/auth/google/status", h.GoogleStatus)
	return app
}

func TestGoogleAuthDerivesRedirectURI(t *testing.T) {
	app := newGoogleTestApp("cid.apps.googleusercontent.com")
	req := httptest.NewRequest("GET", "/api/auth/google?origin="+url.QueryEscape("http://localhost:5190"), nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	loc, _ := url.Parse(resp.Header.Get("Location"))
	if loc.Host != "accounts.google.com" {
		t.Fatalf("redirect host = %q", loc.Host)
	}
	if got := loc.Query().Get("redirect_uri"); got != "http://localhost:5190/api/auth/google/callback" {
		t.Fatalf("redirect_uri = %q", got)
	}
	if loc.Query().Get("state") == "" {
		t.Fatal("state kosong")
	}
}

func TestGoogleAuthRejectsUnknownOrigin(t *testing.T) {
	app := newGoogleTestApp("cid")
	resp, _ := app.Test(httptest.NewRequest("GET", "/api/auth/google?origin="+url.QueryEscape("https://evil.com"), nil))
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestGoogleCallbackEmptyStateRejected(t *testing.T) {
	app := newGoogleTestApp("cid")
	resp, _ := app.Test(httptest.NewRequest("GET", "/api/auth/google/callback?code=x", nil))
	loc := resp.Header.Get("Location")
	if !strings.HasPrefix(loc, "https://app.example.com/login?google_error=") {
		t.Fatalf("location = %q", loc)
	}
}

func TestGoogleNotConfigured(t *testing.T) {
	app := newGoogleTestApp("")
	resp, _ := app.Test(httptest.NewRequest("GET", "/api/auth/google/status", nil))
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `{"enabled":false}` {
		t.Fatalf("status body = %s", body)
	}
	resp, _ = app.Test(httptest.NewRequest("GET", "/api/auth/google?origin="+url.QueryEscape("http://localhost:5173"), nil))
	if loc := resp.Header.Get("Location"); !strings.HasPrefix(loc, "http://localhost:5173/login?google_error=") {
		t.Fatalf("location = %q", loc)
	}
}

// The mode chosen on the consent request must survive to the callback,
// both in the in-memory state store and the cookie fallback.
func TestGoogleAuthCarriesMode(t *testing.T) {
	for query, want := range map[string]string{
		"&mode=register": googleModeRegister,
		"&mode=login":    googleModeLogin,
		"":               googleModeLogin,
	} {
		app := newGoogleTestApp("cid.apps.googleusercontent.com")
		req := httptest.NewRequest("GET", "/api/auth/google?origin="+url.QueryEscape("http://localhost:5190")+query, nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		loc, _ := url.Parse(resp.Header.Get("Location"))
		state := loc.Query().Get("state")
		var cookie string
		for _, c := range resp.Cookies() {
			if c.Name == "oauth_state" {
				cookie = c.Value
			}
		}
		if wantCookie := state + "|" + want + "|http://localhost:5190"; cookie != wantCookie {
			t.Errorf("query %q: cookie = %q, want %q", query, cookie, wantCookie)
		}
	}
}
