# Deployment Guide

Index and checklist for deploying Nodus. This document is the single entry point — the detailed references it links to remain the source of truth.

For methodology and assessment docs, see [`docs/README.md`](README.md).

---

## Architecture at a glance

Nodus has three components:

- **Backend** — FastAPI app, served via `uvicorn`. Stateless. Connects to a relational database.
- **Frontend** — Vite-built React app, served as static files (any CDN or static host works).
- **Database** — SQLite (default, suitable for small deployments), PostgreSQL or MySQL (recommended for production). See [`src/backend/README.md`](../src/backend/README.md) for the switch.

The backend hosts the API and the OpenAPI/Swagger UI under `/api/*`. The frontend is fully decoupled and talks to the backend over HTTPS.

---

## Deployment checklist

### 1. Infrastructure

- [ ] A host for the backend (container or VM). Recommended: **Azure Container Apps** — covered in [`api-docs-deployment.md`](api-docs-deployment.md). Other PaaS options (Cloud Run, ECS, App Service) work the same way. The repo ships with a multi-stage `Dockerfile` that produces a single image bundling frontend + backend — see [`docker.md`](docker.md).
- [ ] A static host for the frontend (any CDN, static-site service, or reverse-proxy serving the `dist/` build). Skip this if you use the bundled single-container image.
- [ ] A managed database, unless using SQLite for a small/internal deployment.
- [ ] TLS in front of both backend and frontend (Let's Encrypt, managed cert, or load-balancer-issued).

### 2. Database

- [ ] Pick the engine: SQLite (single-file, no extra infra), PostgreSQL (recommended), or MySQL.
- [ ] Provision the database and a service-account user.
- [ ] Set `NODUS_DATABASE_URL` accordingly.
- [ ] Run `make db-init` (or the equivalent CLI command — see [`src/backend/README.md`](../src/backend/README.md)) once at first deploy.

Note: SQLite is convenient for proof-of-concept but unsuitable for multiple replicas or concurrent writes at scale. Switch to Postgres before exposing the app to a team.

### 3. Environment variables

Configure all `NODUS_`-prefixed variables. The complete reference with defaults is in [`src/backend/.env.example`](../src/backend/.env.example).

Key variables, grouped:

- **App**: `NODUS_ENV`, `NODUS_ROOT_PATH`, `NODUS_CORS_ORIGINS`.
- **Auth**: `NODUS_AUTH_DISABLED`, `NODUS_AUTH_ENTRA_ENABLED`, secrets — see [`auth.md`](auth.md) for full details.
- **Database**: `NODUS_DATABASE_URL`.
- **API docs**: docs exposure posture — see [`api-docs-deployment.md`](api-docs-deployment.md).
- **Entra ID** (if used): tenant, client ID, redirect URI — see [`auth.md`](auth.md).

### 4. Authentication

Pick an auth mode and configure it. The three modes are documented in [`auth.md`](auth.md):

- [ ] **Disabled** — open access for dev or air-gapped internal use.
- [ ] **Local** — username/password against the database. Bootstrap the first admin with `nodus create-admin`.
- [ ] **Entra ID SSO** — Azure AD integration. Follow the nine-step setup in [`auth.md`](auth.md).

### 5. API documentation exposure

Decide how `/api/docs` (Swagger UI), `/api/redoc`, and `/api/openapi.json` are exposed in production:

- [ ] **Open** — public docs (fine for an open API).
- [ ] **HTTP Basic** — protected docs, useful for an internal API.
- [ ] **Disabled** — no docs route in production.

Full configuration matrix in [`api-docs-deployment.md`](api-docs-deployment.md).

### 6. First-admin bootstrap

After the database is initialised:

- **Local auth**: `uv run python -m app.cli create-admin --username admin` from inside the backend. The command prompts for the password via stdin so it never appears in argv, env vars, or shell history.
- **Entra auth**: users whose group membership matches `NODUS_AUTH_ENTRA_GROUP_ADMIN` are promoted to Admin on first (and every subsequent) login. Details in [`auth.md`](auth.md).

### 7. Smoke checks

- [ ] `GET /api/health` returns 200.
- [ ] `GET /api/openapi.json` returns the schema (unless docs are disabled).
- [ ] Frontend loads, the radar renders, and a non-PublicReader user can sign in.
- [ ] Movement events appear after a ring change.

---

## Operations notes

- **Backups**: scheduled snapshots of the database. See [`src/backend/README.md`](../src/backend/README.md) for the included backup/restore commands (SQLite only — for managed databases use the provider's snapshot tooling).
- **Upgrades**: pull the new image / code; if a schema migration is included, run migrations before swapping traffic.
- **Logs**: backend logs are stdout JSON; route them to your logging stack.
- **Monitoring**: probe `GET /api/health`. The path may include the configured prefix (`NODUS_ROOT_PATH`).

---

## See also

- [`auth.md`](auth.md) — authentication setup in full.
- [`api-docs-deployment.md`](api-docs-deployment.md) — Swagger UI / ReDoc configuration.
- [`docker.md`](docker.md) — Dockerfiles, docker-compose, and image versions.
- [`../src/backend/README.md`](../src/backend/README.md) — backend setup, database, CLI commands.
- [`../src/frontend/README.md`](../src/frontend/README.md) — frontend build and stack.
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — narrative architecture overview.
