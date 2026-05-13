# Nodus Technology Radar — Backend

FastAPI + SQLModel backend for the Nodus Technology Radar webapp. SQLite
by default; any SQLAlchemy-supported server database (Postgres, MySQL, …)
can be swapped in via a single environment variable — see
[Database backend](#database-backend).

## Database backend

The runtime database URL is resolved at process start from
`app.config.database_url()`:

| Source | Used when |
|---|---|
| `NODUS_DATABASE_URL` env var | Set (any non-empty value) |
| Built-in SQLite default | Env var unset |

The SQLite default resolves to an **absolute path** under the backend
source root (`src/backend/radar.db`), so the file lives in one place
regardless of which directory you start the process from. Earlier versions
used a relative path and silently created empty `radar.db` files
wherever the process happened to launch.

### Switching to Postgres (or another server DB)

The schema is dialect-portable — SQLite-specific code paths
(`PRAGMA foreign_keys`, `sqlite_master` rebuild helpers, the destructive
file-deletion gate) are guarded behind an `IS_SQLITE` check in `app/db.py`
and become no-ops on other dialects.

To run against Postgres:

1. Install a driver (`psycopg[binary]` is the modern choice):

    ```bash
    cd src/backend
    uv add 'psycopg[binary]'
    ```

2. Export the URL. The `psycopg` v3 dialect is `postgresql+psycopg`:

    ```bash
    set -x NODUS_DATABASE_URL postgresql+psycopg://nodus:secret@localhost:5432/nodus
    ```

3. Create the schema (the destructive SQLite rebuild path does not fire on
   Postgres):

    ```bash
    make db-init
    ```

4. Boot as normal:

    ```bash
    uv run uvicorn app.main:app --reload
    ```

Notes:

- Treat `NODUS_DATABASE_URL` as a **secret** — it contains the DB
  password. `iter_active_flags()` masks it in startup logs.
- The destructive `NODUS_RESET_DB=1` boot path is SQLite-only by design.
  On Postgres, recreate the database manually instead of deleting files.
- **Databricks is not a fit** for the app database — it is an OLAP store
  and lacks the transactional semantics, FK enforcement, and online
  schema-change support that this schema relies on. Use it for analytics
  on top of an exported snapshot, not as the live backend.

## Destructive-rebuild gate

Boot is non-destructive by default. If the existing database lacks the
`topic` table the app **fails to start** and instructs the operator to
opt in explicitly.

To rebuild a legacy database into the v2 schema, either set `NODUS_RESET_DB=1`
on the next uvicorn start, or run the explicit CLI:

```bash
uv run python -m app.cli db reset --confirm
```

**Either path drops all local data.** Re-run the seed import afterwards
(see below).

## Operator CLI

One-shot tasks that used to run inside the FastAPI lifespan now live behind
explicit subcommands:

```bash
# Schema bootstrap (idempotent)
uv run python -m app.cli db init

# Destructive: drops the SQLite file and recreates empty tables
uv run python -m app.cli db reset --confirm

# Seed reference data (settings is safe to re-run; users is dev/test-only)
uv run python -m app.cli seed --settings
NODUS_ENV=dev uv run python -m app.cli seed --users
uv run python -m app.cli seed --movements
uv run python -m app.cli seed --all

# Idempotent backfills (safe to re-run)
uv run python -m app.cli backfill --hero-images
uv run python -m app.cli backfill --all

# Create the first admin (prompts for password — never appears in argv)
uv run python -m app.cli create-admin --username admin
```

The lifespan now only creates tables and writes default settings rows
(and demo users in dev). Segments, backfills, and demo movements are
not triggered on boot — segments are an operator decision.

## Bootstrapping the first admin

A fresh deployment has no users. Two supported paths:

### Path A — SSO (Entra ID)

If `NODUS_AUTH_ENTRA_*` is configured, the first user whose Azure AD groups
match `NODUS_AUTH_ENTRA_GROUP_ADMIN` is auto-provisioned as an admin the
first time they log in. No CLI step required. See [`docs/auth.md`](../../docs/auth.md).

### Path B — Local admin via CLI

For deployments without SSO (or break-glass alongside SSO), create the first
admin with a one-shot CLI invocation that prompts for the password — the
password never appears in argv, env vars, or shell history.

**Local:**

```bash
cd src/backend
uv run python -m app.cli create-admin --username admin
# Password: ********
# Confirm password: ********
```

**Azure Container Apps:**

```bash
az containerapp exec \
  --name nodus-backend \
  --resource-group <your-rg>
# inside the container:
uv run python -m app.cli create-admin --username admin
```

The container's working directory is the backend source root, so the
command runs identically to local. The Azure Portal's "Console" tab on
the Container App page works too if you prefer a browser-based terminal.

The command refuses to overwrite an existing user unless `--force` is
passed, so re-running it is safe.

## Schema changes

The schema is rebuilt from `SQLModel.metadata` — there are no migration
files. To pick up a model change in development:

```bash
make db-reset   # drops and recreates from current models
make seed-dummy # repopulate with the bundled demo dataset
```

For non-dev environments, take a backup with `/admin/backup`, apply
schema changes via your own tooling, then restore the backup.

## Install

```bash
cd src/backend
uv sync
```

## Run

```bash
uv run uvicorn app.main:app --reload
```

API: `http://localhost:8000`
OpenAPI docs: `http://localhost:8000/docs`

## Seed data

The bundled dummy dataset is the supported way to populate the DB for
development:

```bash
make seed-dummy
```

It writes three generic segments, twenty fictional technologies and a
handful of peer-reference rows. Idempotent — re-running upserts.

For custom datasets, use the admin import endpoints or extend
`app/seed/dummy.py` to suit your deployment.

## Backup / restore

The canonical backup path is the admin API. It covers every restorable
table, includes media blobs, and supports an optional AES-256-GCM
envelope.

Pull a full backup with an admin API key (see `/manage/api` for key
management):

```bash
curl -H "Authorization: Bearer $NTR_TOKEN" \
  -o nodus-backup.zip \
  http://localhost:8000/api/admin/backup
```

Encrypted variant — password sent in the request body, never in the URL:

```bash
curl -H "Authorization: Bearer $NTR_TOKEN" \
  -F password="$BACKUP_PASS" \
  -o nodus-backup-encrypted.bin \
  http://localhost:8000/api/admin/backup/download
```

Restore through the same router (`POST /api/admin/backup/restore`) or
through the **Backup & Restore** page under `/manage/backup`. Inspect
before applying — it surfaces conflicts and lets you pick skip /
overwrite per row.

## Test

```bash
uv run pytest
uv run pytest -q          # quiet output
uv run pytest -v          # verbose per-test output
```

## Lint & type-check

```bash
uv run ruff check app/ tests/          # lint
uv run ruff format app/ tests/         # auto-format
uv run ruff format --check app/ tests/ # format check (CI)
uv run mypy app/ --strict              # type check
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service liveness |
| GET | `/api/radar/current` | Current radar shape (FR §11) |
| GET | `/api/technologies` | List/filter Registry |
| POST | `/api/technologies` | Create technology (with dedup) |
| GET | `/api/technologies/{slug}` | Full technology detail |
| PATCH | `/api/technologies/{id}` | Update technology |
| POST | `/api/technologies/{id}/aliases` | Add alias |
| DELETE | `/api/technologies/{id}/aliases/{alias_id}` | Remove alias |
| POST | `/api/technologies/{id}/factsheet` | Create new factsheet version |
| GET | `/api/technologies/{id}/factsheets` | List factsheet versions |
| GET | `/api/technologies/{id}/factsheets/{version}` | Get specific version |
| GET | `/api/technologies/{id}/movements` | Movement history timeline |
| GET | `/api/nominations` | List nominations |
| POST | `/api/nominations` | Submit nomination |
| POST | `/api/nominations/{id}/triage` | Triage a nomination |
| GET | `/api/cycles` | List cycles |
| POST | `/api/cycles` | Create cycle |
| GET | `/api/cycles/{id}` | Get cycle |
| POST | `/api/cycles/{id}/close` | Close cycle + freeze snapshot |
| GET | `/api/cycles/{id}/deliverables/radar.json` | Radar snapshot JSON |
| GET | `/api/cycles/{id}/deliverables/summary.md` | Summary Brief (Markdown) |
| GET | `/api/cycles/{id}/deliverables/detailed.md` | Detailed Report (Markdown) |
| GET | `/api/cycles/{id}/deliverables/delta.md` | Delta Document (Markdown) |
