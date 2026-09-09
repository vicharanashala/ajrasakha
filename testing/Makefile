# =============================================================================
# testing/Makefile — GNU Make variant for Linux/macOS runners.
# Windows users: use `pwsh -File testing/scripts/run.ps1 <cmd>` instead.
# =============================================================================

DOCKER_DIR  := docker
COMPOSE     := docker compose -f $(DOCKER_DIR)/docker-compose.yml
TESTING_DIR := $(CURDIR)
BACKEND_URL ?= http://localhost:3141
FIREBASE_HOST ?= localhost:9099

.PHONY: help deps up down nuke seed clear smoke logs status ps

help:
	@echo "Targets:"
	@echo "  make deps      install seed Node deps"
	@echo "  make up        docker compose up (mongo + auth-emu + backend)"
	@echo "  make down      docker compose down (keep mongo-data volume)"
	@echo "  make nuke      docker compose down -v (drop mongo-data)"
	@echo "  make seed      run seed_all.mjs end-to-end"
	@echo "  make clear     drop loadtest docs"
	@echo "  make smoke     run scripts/smoke.mjs"
	@echo "  make logs      tail reviewer-backend logs"
	@echo "  make ps        show containers + /api/health"

deps:
	cd $(TESTING_DIR) && [ -d node_modules ] || npm install

up:
	$(COMPOSE) up -d --build
	@echo "waiting for /api/health …"
	@for i in $$(seq 1 90); do \
	  if curl -sf $(BACKEND_URL)/api/health >/dev/null; then echo "✓ healthy"; exit 0; fi; \
	  sleep 2; \
	done; \
	echo "✗ never became healthy"; exit 1

down:
	$(COMPOSE) down

nuke:
	$(COMPOSE) down -v

seed: deps
	cd $(TESTING_DIR) && FIREBASE_EMULATOR_HOST=$(FIREBASE_HOST) node seed/seed_all.mjs

clear:
	cd $(TESTING_DIR) && node seed/clear.mjs

smoke:
	cd $(TESTING_DIR) && BACKEND_URL=$(BACKEND_URL) node scripts/smoke.mjs

logs:
	$(COMPOSE) logs -f reviewer-backend

ps:
	$(COMPOSE) ps
	@curl -sS $(BACKEND_URL)/api/health || true