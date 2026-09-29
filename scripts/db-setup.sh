#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# db-setup.sh — cross-auth helper dipakai oleh `make db-create` dan
# `make db-reset`. Menangani DUA mode autentikasi Postgres yang umum di OS:
#
#   1. PEER auth (Ubuntu/Debian default)  → pakai `sudo -u postgres psql`
#      Tidak butuh password; cukup user postgres ada di /etc/passwd.
#
#   2. PASSWORD auth (TCP localhost)       → pakai `PGPASSWORD=... psql`
#      Memerlukan password postgres role di-set (default file ini: 'postgres').
#
# Strategi: coba peer-auth dulu (privileged, no password), fallback ke
# PASSWORD auth kalau peer tidak tersedia atau gagal. Plus: setelah CREATE
# DATABASE via peer, script otomatis ALTER USER postgres WITH PASSWORD
# sehingga Go app (yang connect via TCP — network namespace terpisah) bisa
# pakai PGPASSWORD.
#
# Usage:
#   ./scripts/db-setup.sh create   # idempotent create
#   ./scripts/db-setup.sh drop     # drop if exists
#   ./scripts/db-setup.sh reset    # drop + create
# ──────────────────────────────────────────────────────────────────────────────

set -uo pipefail

DB_NAME="${DB_NAME:-master_db}"
DB_OWNER="${DB_OWNER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

# ─── 1. Probe auth mode ───────────────────────────────────────────────────────
DB_SUDO=""
if command -v sudo >/dev/null 2>&1 && id "$DB_OWNER" >/dev/null 2>&1; then
  if sudo -u "$DB_OWNER" psql -tc "SELECT 1" >/dev/null 2>&1; then
    DB_SUDO="sudo -u $DB_OWNER"
  else
    echo "  ⚠️  $DB_OWNER unix user ada tapi peer auth gagal — pakai PGPASSWORD" >&2
  fi
fi

# ─── 2. Helper — run a SQL statement using whichever auth works ────────────────
run_psql() {
  local sql="$1"
  if [ -n "$DB_SUDO" ]; then
    $DB_SUDO psql -c "$sql"
  else
    # TCP path needs DATABASE_URL-like connection. Use explicit host/user.
    PGPASSWORD="$DB_PASSWORD" psql \
      -h "${DB_HOST:-localhost}" \
      -p "${DB_PORT:-5432}" \
      -U "$DB_OWNER" \
      -d postgres \
      -c "$sql"
  fi
}

# Probe existence of DB
db_exists() {
  local q="SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'"
  if [ -n "$DB_SUDO" ]; then
    $DB_SUDO psql -tAc "$q" 2>/dev/null | grep -q 1
  else
    PGPASSWORD="$DB_PASSWORD" psql -h "${DB_HOST:-localhost}" \
      -U "$DB_OWNER" -d postgres -tAc "$q" 2>/dev/null | grep -q 1
  fi
}

# ─── 3. Action dispatcher ─────────────────────────────────────────────────────
action="${1:-create}"

case "$action" in
  create)
    if [ -n "$DB_SUDO" ]; then
      echo "  ↪ Pakai peer auth via sudo -u $DB_OWNER"
    else
      echo "  ↪ Pakai PGPASSWORD (password=${DB_PASSWORD})"
    fi
    if db_exists; then
      echo "  ✓ ${DB_NAME} sudah ada, skip"
      # Still ensure password is set so Go app over TCP can connect.
      if [ -n "$DB_SUDO" ]; then
        if $DB_SUDO psql -tAc "SELECT passwd IS NULL FROM pg_shadow WHERE usename='${DB_OWNER}'" 2>/dev/null | grep -q t; then
          $DB_SUDO psql -c "ALTER USER ${DB_OWNER} WITH PASSWORD '${DB_PASSWORD}';" >/dev/null
          echo "  ↪ Set postgres password ke '${DB_PASSWORD}' (untuk Go app via TCP)"
        fi
      fi
      exit 0
    fi
    if ! run_psql "CREATE DATABASE ${DB_NAME} OWNER ${DB_OWNER};"; then
      echo "  ❌ CREATE DATABASE gagal" >&2
      exit 1
    fi
    # Auto-set postgres password so subsequent TCP auth works.
    if [ -n "$DB_SUDO" ]; then
      $DB_SUDO psql -c "ALTER USER ${DB_OWNER} WITH PASSWORD '${DB_PASSWORD}';" >/dev/null
      echo "  ✓ ${DB_NAME} dibuat via peer auth"
      echo "  ✓ postgres password diset ke '${DB_PASSWORD}' (untuk Go app TCP)"
    else
      echo "  ✓ ${DB_NAME} dibuat via PGPASSWORD"
    fi
    ;;

  drop)
    if ! db_exists; then
      echo "  ℹ️  ${DB_NAME} tidak ada, skip drop"
      exit 0
    fi
    if ! run_psql "DROP DATABASE IF EXISTS ${DB_NAME};"; then
      echo "  ❌ DROP DATABASE gagal" >&2
      exit 1
    fi
    echo "  ✓ ${DB_NAME} di-drop"
    ;;

  reset)
    "$0" drop || exit 1
    "$0" create || exit 1
    ;;

  probe)
    # Diagnostic helper used by Makefile to detect auth mode silently.
    if [ -n "$DB_SUDO" ]; then
      echo "peer:sudo:$DB_OWNER"
    else
      echo "password:${DB_OWNER}@${DB_HOST:-localhost}:${DB_PORT:-5432}"
    fi
    exit 0
    ;;

  *)
    echo "Usage: $0 {create|drop|reset|probe}" >&2
    exit 2
    ;;
esac
