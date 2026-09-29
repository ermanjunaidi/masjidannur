# ─── MasterApp Makefile — simple, Docker-first ─────────────────────────────
# Semua command di sini berjalan di folder app (hasil clone dari template).
# Production = FE + BE + DB semua di Docker (docker-compose.prod.yml).
# Local dev  = FE (Vite) + BE (Air) di host OS, DB tetap di Docker.

.PHONY: help dev up down logs ps db-up db-down db-shell

# ─── Colors ────────────────────────────────────────────────────────────────
BLUE    := \033[1;34m
GREEN   := \033[1;32m
YELLOW  := \033[1;33m
CYAN    := \033[1;36m
RED     := \033[0;31m
RESET   := \033[0m

COMPOSE_PROD := docker-compose.prod.yml

# Port auto-detection dari .env (fallback aman)
APP_PORT_DEV  := $(shell grep -E '^APP_PORT=' .env 2>/dev/null | head -1 | sed -E 's/^APP_PORT=//' | tr -d '\r\n "')
APP_PORT_DEV  := $(or $(APP_PORT_DEV),8081)
VITE_PORT_VAL := $(shell grep -E '^VITE_PORT=' frontend/.env 2>/dev/null | head -1 | sed -E 's/^VITE_PORT=//' | tr -d '\r\n "')
VITE_PORT_VAL := $(or $(VITE_PORT_VAL),5173)

default: help

help:
	@echo ""
	@echo "$(CYAN)╔══════════════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║   MasterApp Commands                         ║$(RESET)"
	@echo "$(CYAN)╚══════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@echo "$(BLUE)PRODUCTION — semua di Docker (FE + BE + DB):$(RESET)"
	@echo "  $(GREEN)make up$(RESET)        Build & start semua container (baca .env.production)"
	@echo "  $(GREEN)make down$(RESET)      Stop containers"
	@echo "  $(GREEN)make ps$(RESET)        Status containers"
	@echo "  $(GREEN)make logs$(RESET)      Tail log semua container"
	@echo ""
	@echo "$(BLUE)LOCAL DEV — FE (Vite) + BE (Air) di OS, DB di Docker:$(RESET)"
	@echo "  $(GREEN)make db-up$(RESET)     Start Postgres container (port 5432)"
	@echo "  $(GREEN)make db-down$(RESET)   Stop Postgres container"
	@echo "  $(GREEN)make db-shell$(RESET)  Masuk psql shell"
	@echo "  $(GREEN)make dev$(RESET)       Backend (hot-reload) + frontend (hot-reload)"
	@echo ""
	@echo "$(YELLOW)Ports: FE=$(VITE_PORT_VAL)  BE=$(APP_PORT_DEV)$(RESET)"
	@echo ""

# ─── Production (Docker) ────────────────────────────────────────────────────
up:
	@echo "$(BLUE)▶ Starting production (FE + BE + DB in Docker)...$(RESET)"
	@docker compose -f $(COMPOSE_PROD) up -d --build
	@echo "$(GREEN)✅ Done. Cek status: make ps | Logs: make logs$(RESET)"

down:
	@docker compose -f $(COMPOSE_PROD) down

ps:
	@docker compose -f $(COMPOSE_PROD) ps

logs:
	@docker compose -f $(COMPOSE_PROD) logs -f

# ─── Local dev DB (Postgres di Docker) ──────────────────────────────────────
DB_NAME     ?= $(shell grep -E '^DB_NAME=' backend/.env 2>/dev/null | head -1 | sed -E 's/^DB_NAME=//' | tr -d '\r\n "')
DB_USER     ?= $(shell grep -E '^DB_USER=' backend/.env 2>/dev/null | head -1 | sed -E 's/^DB_USER=//' | tr -d '\r\n "')
DB_PASSWORD ?= $(shell grep -E '^DB_PASSWORD=' backend/.env 2>/dev/null | head -1 | sed -E 's/^DB_PASSWORD=//' | tr -d '\r\n "')
DB_NAME     := $(or $(DB_NAME),master_db)
DB_USER     := $(or $(DB_USER),postgres)
DB_PASSWORD := $(or $(DB_PASSWORD),postgres)

db-up:
	@docker run -d --name masterapp-db \
		-e POSTGRES_USER=$(DB_USER) -e POSTGRES_PASSWORD=$(DB_PASSWORD) -e POSTGRES_DB=$(DB_NAME) \
		-p 5432:5432 -v masterapp_pgdata:/var/lib/postgresql/data \
		postgres:15-alpine 2>/dev/null || docker start masterapp-db
	@echo "$(GREEN)✅ Postgres jalan di localhost:5432 (user=$(DB_USER), db=$(DB_NAME))$(RESET)"

db-down:
	@docker rm -f masterapp-db 2>/dev/null || true
	@echo "$(GREEN)✅ Postgres dihentikan$(RESET)"

db-shell:
	@docker exec -it masterapp-db psql -U $(DB_USER) -d $(DB_NAME)

# ─── Local dev (FE + BE di OS, hot-reload) ─────────────────────────────────
dev:
	@echo "$(BLUE)▶ Memulai development LOKAL$(RESET)"
	@echo "$(YELLOW)   Pastikan Postgres jalan: make db-up (atau pakai service db dari compose)$(RESET)"
	@if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^masterapp-db$$'; then \
		echo "$(RED)⚠️  Postgres container 'masterapp-db' belum jalan. Jalankan: make db-up$(RESET)"; \
	fi
	@trap 'kill 0' INT TERM EXIT; \
	(cd backend && air) & \
	(cd frontend && npm run dev) & \
	wait
