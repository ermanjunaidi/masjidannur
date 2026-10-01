package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Env holds all environment variables for the application.
type Env struct {
	DBHost         string
	DBPort         string
	DBUser         string
	DBPassword     string
	DBName         string
	DBSSLMode      string
	AppPort        string
	AppEnv         string
	JWTSecret      string
	// Google OAuth2 (login via Google). Empty values disable the flow.
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	// SMTP for password-reset emails. Empty SMTP host falls back to logging
	// the reset link to stdout (dev mode).
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	FrontendURL  string
	// AllowedOrigins is the comma-separated list of frontend origins that are
	// permitted to call this backend (CORS). Parsed from ALLOWED_ORIGINS env.
	// Token is Bearer (Authorization header, no cookies), so we don't need
	// AllowCredentials — but we DO want to whitelist origins so only the
	// Netlify SPA / custom domain can reach the API. Empty list = no browser
	// origins allowed (production hardening); in development main.go falls
	// back to "*" wildcard.
	AllowedOrigins []string
}

// NewEnv loads .env file(s) and returns a parsed Env struct.
//
// Loading order (later overrides earlier):
//   1. .env (CWD)           — legacy path: kalau dijalankan dari
//                             apps/master/backend
//   2. ../.env              — master-root fallback: ketika dijalankan
//                             dari apps/master/ via `go run backend/...`
//                             atau via `air` dengan CWD=backend tetap resolve
//   3. .env.production      — overlay HANYA kalau APP_ENV=production
//   4. ../.env.production   — overlay HANYA kalau APP_ENV=production
//
// Production overlay step diperlukan supaya:
//   - `make local` di-host → APP_ENV=development (dari step 1/2) →
//     tidak override dengan .env.production
//   - `make up` di-Docker → docker compose sets APP_ENV=production via
//     env_file, lalu step 3/4 menimpa DATABASE_URL/JWT_SECRET dengan values
//     production-specific.
//
// Untuk APP_ENV sendiri, digunakan sebagai hint cek di step 3 — kalau sudah
// 'production' sebelum step 3, kita overlay. Kalau belum, tetap default
// development values.
func NewEnv() *Env {
	loadEnvFiles()

	// Production-aware DB_HOST default: in production inside a Docker
	// container, the Postgres database runs as the `db` service inside
	// the same Docker Compose network — reachable via the service name "db".
	// The canonical value comes from backend/.env.production via loadEnvFiles().
	defaultDBHost := "localhost"
	appEnv := getEnv("APP_ENV", "development")
	if appEnv == "production" {
		// Default ke "db" (compose service name) — Postgres sekarang di dalam
		// Docker (service `db`), bukan di host OS. backend/.env.production
		// biasanya override ini dengan DB_HOST=db.
		defaultDBHost = "db"
	}

	env := &Env{
		DBHost:         getEnv("DB_HOST", defaultDBHost),
		DBPort:         getEnv("DB_PORT", "5432"),
		DBUser:         getEnv("DB_USER", "postgres"),
		DBPassword:     getEnv("DB_PASSWORD", "postgres"),
		DBName:         getEnv("DB_NAME", "master_db"),
		DBSSLMode:      getEnv("DB_SSLMODE", "disable"),
		AppPort:        getEnv("APP_PORT", "3000"),
		AppEnv:         appEnv,
		JWTSecret:      getEnv("JWT_SECRET", "supersecret"),
		GoogleClientID: getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", ""),
		SMTPHost:       getEnv("SMTP_HOST", ""),
		SMTPPort:       getEnv("SMTP_PORT", "587"),
		SMTPUser:       getEnv("SMTP_USER", ""),
		SMTPPassword:   getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:       getEnv("SMTP_FROM", "no-reply@masjidannur.my.id"),
		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:5178"),
		AllowedOrigins: parseCSV(getEnv("ALLOWED_ORIGINS", "")),
	}

	fmt.Printf("[config] Loaded environment: APP_ENV=%s  DB_HOST=%s\n", env.AppEnv, env.DBHost)

	// ── Startup validation: production MUST NOT point at localhost DB ─────
	// This catches misconfiguration where .env.production is missing or
	// doesn't set DB_HOST. In a Docker container, "localhost" is the
	// container itself — Postgres runs as the `db` service in the same
	// Docker network, reachable only via service name "db".
	if env.AppEnv == "production" && env.DBHost == "localhost" {
		fmt.Println("[config] FATAL: APP_ENV=production but DB_HOST=localhost — Postgres tidak bisa dijangkau dari dalam container Docker.")
		fmt.Println("[config] Pastikan backend/.env.production memiliki DB_HOST=db")
		fmt.Println("[config] (db = nama service Postgres di docker-compose.prod.yml)")
		os.Exit(1)
	}

	return env
}

// DSN returns the Postgres connection string.
// If DATABASE_URL is set, it is returned as-is (supports postgresql:// URI format).
// Otherwise it builds a key=value DSN from individual DB_* env vars.
func (e *Env) DSN() string {
	if url, ok := os.LookupEnv("DATABASE_URL"); ok && url != "" {
		return url
	}
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=Asia/Jakarta",
		e.DBHost, e.DBPort, e.DBUser, e.DBPassword, e.DBName, e.DBSSLMode,
	)
}

func loadEnvFiles() {
	// ── CRITICAL: read APP_ENV from environment BEFORE touching .env files. ──
	// In Docker production, env_file (docker-compose.prod.yml) injects
	// APP_ENV=production into the container BEFORE the binary starts.
	// If we call Overload(".env") first, it will clobber the Docker-injected
	// value with APP_ENV=development → the production check below becomes
	// false → .env.production is NEVER loaded → DB_HOST stays "localhost"
	// → container can't reach Postgres on the host.
	//
	// Strategy: snapshot APP_ENV now, then conditionally skip dev .env files
	// in production mode so they can't overwrite the Docker env_file values.
	isProduction := os.Getenv("APP_ENV") == "production"

	if !isProduction {
		// Development: load .env files with dev defaults (localhost DB, etc.).
		// godotenv silently ignores missing files.
		_ = godotenv.Overload(".env")
		_ = godotenv.Overload("../.env")
	}

	// Production: only overlay .env.production which contains db service
	// DB_HOST, production JWT secret, and other runtime overrides.
	if isProduction {
		_ = godotenv.Overload(".env.production")
		_ = godotenv.Overload("../.env.production")
	}
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}

// parseCSV splits a comma-separated string into a trimmed, non-empty slice.
// Used for list-style env vars like ALLOWED_ORIGINS
// (e.g. "https://a.example.com,https://b.example.com").
// Returns nil for empty/whitespace-only input so callers can detect "unset"
// via len(out) == 0.
func parseCSV(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
