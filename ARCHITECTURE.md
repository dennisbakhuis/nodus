# Architecture

High-level architecture of Nodus. For the conceptual methodology the app implements, see [`docs/methodology.md`](docs/methodology.md). For the assessment data model in operator terms, see [`docs/assessment-criteria.md`](docs/assessment-criteria.md) and [`docs/assessment-api.md`](docs/assessment-api.md).

---

## Components

```
┌─────────────────────────┐         ┌──────────────────────────┐
│        Frontend         │ ──API──▶│         Backend          │
│ (Vite / React / D3.js)  │         │ (FastAPI / SQLAlchemy)   │
│                         │         │                          │
│ - Radar view            │         │ - REST API under /api/*  │
│ - List / tree / detail  │         │ - Auth (local / Entra)   │
│ - Admin / manage UI     │         │ - Swagger UI / ReDoc     │
│ - PDF export (jsPDF)    │         │ - CLI (uv run nodus ...) │
└─────────────────────────┘         └────────────┬─────────────┘
                                                 │
                                       ┌─────────▼──────────┐
                                       │     Database       │
                                       │ SQLite / Postgres  │
                                       │  / MySQL           │
                                       └────────────────────┘
```

The frontend is a static bundle. The backend is a stateless Python process. The database is the only stateful component.

---

## Stack

| Layer    | Technology                                          |
|----------|-----------------------------------------------------|
| Backend  | Python 3.14+, FastAPI, SQLAlchemy, Pydantic v2      |
| Auth     | JWT (local) or Entra ID OIDC                        |
| Frontend | Vite, React 19, TypeScript, D3.js, jsPDF            |
| Tests    | pytest (backend), vitest + Playwright (frontend)    |
| Tooling  | uv, pre-commit, ruff, mypy, eslint, prettier, tsc   |

Detailed versions and bundle sizes are in the per-module READMEs.

---

## Data model — the core entities

The model is built around a few entities. The full schema lives in [`src/backend/app/models/`](src/backend/app/models/).

- **Topic** — the named subject of scouting (e.g. "Quantum Computing"). Has one or more **Aliases** for dedup.
- **Technology** — a tracked technology with `registry_status` (`On Radar` / `Backlog` / `Archive`), `current_ring` (when on radar), `current_segment_id`, and `current_factsheet_id`.
- **Factsheet** — versioned descriptive record of a Technology. `UNIQUE(technology_id, version)`. Each new version is created via `POST /technologies/{tech_id}/factsheet`.
- **Assessment** — the six-criterion scoring. One-to-one with a Factsheet version (`UNIQUE(factsheet_id)`). Immutable once written — see [`docs/assessment-api.md`](docs/assessment-api.md).
- **MovementEvent** — append-only audit log. Emitted on status change, ring change, segment change, factsheet edit. The audit trail behind the cycle delta document.
- **Cycle** — scouting cycle, opened and closed by an Admin. Closure freezes a `snapshot_json` of radar state.
- **Initiative** — concrete pilot / PoC / programme attached to a Technology.

### Why immutability for Factsheet+Assessment

Past judgements are evidence of the state of knowledge at that time. Editing a prior factsheet in place would silently rewrite history and break the delta document. Instead, every revision is a new version. Database constraints enforce the "at most one assessment per factsheet" rule.

The rationale is repeated, with operator framing, in [`docs/assessment-api.md`](docs/assessment-api.md).

---

## Schema evolution

**Known gap — automatic schema upgrades run on SQLite only.** Adding a column
to an existing table works in SQLite development and on a freshly created
Postgres/MySQL database, and silently does nothing on a Postgres/MySQL database
that already exists. Read this section before changing a model.

The schema is declared by `SQLModel.metadata` and created with `create_all()`
at startup (`src/backend/app/db.py`). `create_all()` adds missing *tables*; it
never alters a table that is already there. Three hand-rolled helpers cover the
difference:

| Helper | What it does | Dialects |
|--------|--------------|----------|
| `_ensure_column()` | `PRAGMA table_info` then `ALTER TABLE … ADD COLUMN` when absent | SQLite only |
| `_maybe_rebuild_user_table()` | Rebuilds `user` row-by-row to widen a CHECK constraint SQLite cannot alter in place | SQLite only |
| `_ensure_person_profiles()` | `CREATE UNIQUE INDEX IF NOT EXISTS` plus a profile backfill | SQLite + Postgres |

Only the third runs outside SQLite; `_apply_post_create_migrations()`, which
wraps the first two, is guarded by `if IS_SQLITE`. These steps are re-scanned on
every boot, are idempotent by construction, and keep no record of what has been
applied — so there is no version, no ordering, and no way back.

That is workable for a single-file SQLite deployment and is what has carried the
project so far. It does not hold once a deployment moves to Postgres, which
[`docs/deployment.md`](docs/deployment.md) recommends for anything beyond a
proof of concept.

### TODO — adopt Alembic

Planned as its own change, **before the next schema change**, not alongside one.
Introducing it while no migration is pending is what makes it cheap: the first
revision is an empty baseline of the current schema rather than a reconstruction
of history.

1. Add the `alembic` dependency; `alembic.ini` plus `env.py` wired to
   `SQLModel.metadata` and `NODUS_DATABASE_URL`.
2. Autogenerate one baseline revision describing the schema as it stands.
3. Add a `make migrate` target and run it on deploy, before traffic is swapped.
4. Retire the SQLite-only helpers: keep them for one release so existing SQLite
   databases still self-upgrade, then fold their effect into a real revision and
   delete them.

The risk in this work is the existing databases, not Alembic. A new database
takes `alembic upgrade head`; a database that already has the schema must take
`alembic stamp <baseline>` and must never be upgraded onto it. Write that
procedure down before running it against prd, and take a backup first.

---

## Authentication and visibility

Four roles, three modes — full reference in [`docs/auth.md`](docs/auth.md):

- **PublicReader** — external. Sees only the published radar with `not_for_external_publication` topics filtered out.
- **Reader** — internal stakeholders. Reads everything, including unpublished factsheets.
- **Writer** — curators. Reads + creates factsheets, assessments, initiatives; sets rings; closes cycles.
- **Admin** — DB lifecycle, user management, cycle administration.

Modes: `disabled` (open), `local` (DB-backed username/password), `entra` (Azure AD SSO).

Permission enforcement is centralised in `app/auth.py` and applied as FastAPI dependencies on the routes.

---

## API surface

Routes are namespaced under `/api/` and the OpenAPI schema is the source of truth.

- `/api/topics/*` — topic CRUD, dedup, aliases.
- `/api/technologies/*` — technology lifecycle, ring/segment, factsheets, assessments, initiatives, movements.
- `/api/segments/*`, `/api/strategic-innovation-fields/*` — taxonomy.
- `/api/cycles/*` — scouting cycle administration.
- `/api/auth/*` — login, logout, current user.
- `/api/docs`, `/api/redoc`, `/api/openapi.json` — interactive documentation (configurable exposure, see [`docs/api-docs-deployment.md`](docs/api-docs-deployment.md)).

The full endpoint table is maintained in [`src/backend/README.md`](src/backend/README.md). The assessment-related endpoints are explained in operator terms in [`docs/assessment-api.md`](docs/assessment-api.md).

---

## Repository structure

```
nodus/
├── docs/                       Subject-matter documentation
├── src/
│   ├── backend/                FastAPI app
│   │   ├── app/
│   │   │   ├── models/         SQLAlchemy ORM models
│   │   │   ├── schemas/        Pydantic request/response schemas
│   │   │   ├── routers/        FastAPI routers (one per entity)
│   │   │   ├── auth.py         Auth core
│   │   │   ├── auth_entra.py   Entra ID OIDC handling
│   │   │   ├── cli.py          uv run nodus ...
│   │   │   ├── config.py       Settings
│   │   │   ├── db.py           Engine, session, init
│   │   │   └── main.py         FastAPI app factory
│   │   ├── tests/              pytest
│   │   └── pyproject.toml
│   └── frontend/               React + Vite app
│       ├── src/
│       │   ├── radar/          D3.js radar view
│       │   ├── list/           List view
│       │   ├── tree/           Group + dependency tree view
│       │   ├── topic-detail/   Topic detail page
│       │   ├── manage/         Admin/Writer management UI
│       │   ├── shared/         Cross-view components
│       │   └── styles/
│       ├── tests/              vitest + Playwright
│       └── package.json
├── assets/                     Logos, screenshots, hero images
├── Makefile                    make help for the catalogue
└── ...meta files (LICENSE, CONTRIBUTING.md, etc.)
```

---

## See also

- [`docs/methodology.md`](docs/methodology.md) — the tech-radar methodology being implemented.
- [`docs/deployment.md`](docs/deployment.md) — deploying Nodus.
- [`docs/auth.md`](docs/auth.md) — authentication modes and roles in full.
- [`src/backend/README.md`](src/backend/README.md) — backend setup, CLI, endpoint table.
- [`src/frontend/README.md`](src/frontend/README.md) — frontend stack and scripts.
