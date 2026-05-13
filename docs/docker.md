# Docker

Reference for the Docker setup that ships with Nodus. Three image variants
are provided so you can pick the deployment topology that suits you:

| File | Purpose |
|---|---|
| `Dockerfile` (repo root) | **Single-container production image** — multi-stage build that compiles the Vite frontend, then bundles `dist/` into the Python runtime and serves it from FastAPI alongside the API. |
| `src/backend/Dockerfile` | **Backend-only image** — used by `docker-compose` for local dev, or when you host the frontend separately (static-site service, CDN, separate container). |
| `src/frontend/Dockerfile` + `src/frontend/nginx.conf` | **Frontend-only image** — Vite build served by nginx, with a reverse-proxy rule that forwards `/api/`, `/docs`, `/redoc`, and `/openapi.json` to the backend service. |

## Quick start — local dev with compose

```bash
cp .env.example .env       # then edit
docker compose up --build
```

- Frontend on <http://localhost:3000> (nginx serving the Vite build).
- Backend on <http://localhost:8000>.
- SQLite database persists in the named volume `backend-db` across rebuilds.
- The compose file mounts `src/backend/app` from the host, so backend code
  changes hot-reload via uvicorn's `--reload`.

`docker compose down` stops the services; add `-v` to also drop the
database volume.

## Single-container production image

The root `Dockerfile` produces one image that serves both the API and the
built frontend. This is the right choice for Azure Container Apps,
Cloud Run, Fly.io, or any single-container PaaS.

```bash
# Tag with the canonical version and a moving :latest pointer.
docker build \
  --build-arg APP_VERSION=$(cat VERSION) \
  -t nodus:$(cat VERSION) \
  -t nodus:latest .

docker run --rm \
  -p 8000:8000 \
  --env-file .env \
  -v nodus-data:/app/data \
  -e NODUS_DATABASE_URL=sqlite:////app/data/radar.db \
  nodus:latest
```

`make docker-build` runs the same command. `APP_VERSION` populates the
`org.opencontainers.image.version` label and is written into the image
at `/app/app/VERSION` so the running backend resolves it via the
`_resolve_version()` fallback chain.

The frontend is served from `/`; the API stays under `/api/*`; OpenAPI
surfaces (`/docs`, `/redoc`, `/openapi.json`) sit at the root. The
FastAPI static mount is conditional on `src/backend/static/` existing,
which the Dockerfile arranges automatically — in dev (no static dir) the
mount is a silent no-op, so nothing changes for `make backend`.

### How the multi-stage build is organised

1. **`frontend-build`** — `mcr.microsoft.com/azurelinux/base/nodejs:24`
   runs `npm ci` + `npm run build` and produces `frontend/dist/`. MCR is
   used instead of Docker Hub to avoid rate limits on shared CI runners.
2. **`runtime`** — `python:3.14-slim-bookworm` installs Python deps via
   `uv sync --frozen --no-install-project --no-dev`, copies the backend
   `app/` source, and finally pulls in the frontend `dist/` as `./static`.

Layers are ordered so that dependency installation is cached across code
changes: `pyproject.toml` + `uv.lock` and `package*.json` are copied
before the rest of the source.

## Environment variables

Both compose and the production image read `NODUS_*` variables from the
container environment. Full reference with defaults lives in
[`src/backend/.env.example`](../src/backend/.env.example); a
compose-oriented subset is at [`.env.example`](../.env.example) in the
repo root.

The variables you almost always set in production:

| Variable | Why |
|---|---|
| `NODUS_ENV` | `prod` blocks demo-user seeding; `dev`/`test` allows it. |
| `NODUS_DATABASE_URL` | Point at managed Postgres — SQLite is **ephemeral** inside containers unless you mount a volume at the DB path. |
| `NODUS_CORS_ORIGINS` | Comma-separated origins the frontend will call from. |
| `NODUS_DOCS_DISABLED` / `NODUS_DOCS_PASSWORD` | Hide or protect Swagger/ReDoc. |
| `NODUS_AUTH_ENTRA_*` | Entra ID SSO config — see [`auth.md`](auth.md). |

`.env` is in `.dockerignore`; secrets are never baked into images.

## Data persistence

SQLite is convenient for dev but ephemeral in a container. For any
non-throwaway deployment either:

- Mount a volume at the SQLite file's directory and point
  `NODUS_DATABASE_URL` at it (the compose file does this — see the
  `backend-db` volume and the `/app/data` mount), or
- Switch to Postgres via `NODUS_DATABASE_URL=postgresql+psycopg://...`
  (see [`src/backend/README.md`](../src/backend/README.md) for driver
  install and migration notes).

## `.dockerignore` files

There are three:

- `/.dockerignore` — root, applied by the root `Dockerfile` build.
- `src/backend/.dockerignore` — applied when compose builds the backend
  image (`context: ./src/backend`). Excludes `.venv/`, caches, the local
  `radar.db`, etc.
- `src/frontend/.dockerignore` — applied when compose builds the
  frontend image. Excludes `node_modules/`, `dist/`, Playwright caches.

Each file is scoped to its build context — Docker reads
`.dockerignore` from the context root, not the repository root.

## Image versions

The Dockerfiles pin to current stable bases:

- **Python 3.14** (`python:3.14-slim-bookworm`) — matches the
  `requires-python = ">=3.14"` in `pyproject.toml`.
- **Node.js 24** (Azure Linux MCR for the bundled build; alpine for the
  standalone frontend image) — current Node release line.
- **nginx 1.27 alpine** for the standalone frontend image.
- **uv (latest)** from the official `ghcr.io/astral-sh/uv` distroless
  image, copied in as a single binary.

Bump these together when a new Python / Node LTS lands.

## Health probes

The backend exposes `GET /api/health`. Compose uses it as the backend
service's healthcheck so the frontend service only starts once the
backend is reachable. For Container Apps / Kubernetes, point liveness
and readiness probes at the same path on port 8000.

## See also

- [`deployment.md`](deployment.md) — end-to-end deployment checklist.
- [`api-docs-deployment.md`](api-docs-deployment.md) — Swagger/ReDoc
  exposure in production.
- [`auth.md`](auth.md) — auth modes including Entra ID SSO.
- [`../src/backend/README.md`](../src/backend/README.md) — backend
  database and CLI reference.
