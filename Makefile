.DEFAULT_GOAL := help

.PHONY: help backend frontend seed seed-dummy db-init db-reset seed-settings seed-demo-users backfill test test-backend test-frontend test-e2e version bump release docker-build docker-compose-build

help:  ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\nTargets:\n"} \
		/^[a-zA-Z0-9_-]+:.*##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } \
		/^## .*/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 4) }' $(MAKEFILE_LIST)

## Dev servers

backend:  ## Run the FastAPI backend with auto-reload (port 8000)
	cd src/backend && uv sync && uv run uvicorn app.main:app --reload

frontend:  ## Run the Vite frontend dev server (port 5173)
	cd src/frontend && npm install && npm run dev

## DB lifecycle

db-init:  ## Create tables if missing (idempotent)
	cd src/backend && uv run python -m app.cli db init

db-reset:  ## Drop the SQLite DB file and recreate empty tables (destructive)
	cd src/backend && uv run python -m app.cli db reset --confirm

## Seed data

seed:  ## Reset the DB and re-seed settings, demo users, and the dummy dataset (destructive)
	cd src/backend && uv run python -m app.cli db reset --confirm \
		&& uv run python -m app.cli seed --settings \
		&& NODUS_ENV=dev uv run python -m app.cli seed --users \
		&& uv run python -m app.seed.dummy

seed-dummy:  ## Populate the DB with the bundled 20-topic dummy dataset
	cd src/backend && uv run python -m app.seed.dummy

seed-settings:  ## Seed default settings rows (always safe to re-run)
	cd src/backend && uv run python -m app.cli seed --settings

seed-demo-users:  ## Seed demo accounts (NODUS_ENV=dev/test only)
	cd src/backend && NODUS_ENV=dev uv run python -m app.cli seed --users

backfill:  ## Run every idempotent backfill step
	cd src/backend && uv run python -m app.cli backfill --all

## Test runners

test: test-backend test-frontend  ## Run backend + frontend unit/integration tests

test-backend:  ## Run backend pytest suite
	cd src/backend && uv run pytest

test-frontend:  ## Run frontend vitest suite
	cd src/frontend && npm test

test-e2e:  ## Run Playwright end-to-end tests (needs the dev server)
	cd src/frontend && npm run test:e2e

## Versioning

version:  ## Print the current canonical version
	@cat VERSION

bump:  ## Bump the canonical version (usage: make bump VERSION=0.2.0)
	@if [ -z "$(VERSION)" ]; then echo "Usage: make bump VERSION=X.Y.Z" >&2; exit 2; fi
	./scripts/bump-version.sh "$(VERSION)"

release:  ## Bump version, commit, tag (usage: make release VERSION=0.2.0)
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=X.Y.Z" >&2; exit 2; fi
	@if ! git diff --quiet || ! git diff --cached --quiet; then \
		echo "Working tree is dirty; commit or stash first." >&2; exit 1; \
	fi
	./scripts/bump-version.sh "$(VERSION)"
	git add VERSION src/backend/uv.lock src/frontend/package.json src/frontend/package-lock.json
	git commit -m "Release v$(VERSION)"
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@echo
	@echo "Tagged v$(VERSION). Push with: git push --follow-tags"

## Docker

docker-build:  ## Build the single-container production image (tags :VERSION and :latest)
	@v=$$(cat VERSION); \
	echo "Building nodus:$$v"; \
	docker build --build-arg APP_VERSION=$$v -t nodus:$$v -t nodus:latest .

docker-compose-build:  ## Build the docker-compose stack with VERSION wired in
	NODUS_VERSION=$$(cat VERSION) docker compose build
