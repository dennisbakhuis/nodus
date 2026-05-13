# Onboarding

Your first 30 minutes with Nodus, ordered for a working developer who has just cloned the repo.

## 0. Five-minute orientation (read first)

1. [`README.md`](README.md) — what Nodus is, the architecture at a glance, key features.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — components, stack, data model.

## 1. Local setup (10 minutes)

Prerequisites: `uv` for Python, `node` LTS for the frontend, and `make`.

```bash
# clone
git clone https://github.com/dennisbakhuis/nodus.git
cd nodus

# install pre-commit hooks
uv tool install pre-commit
pre-commit install

# discover the rest
make help
```

Then bring up backend and frontend. Per-module instructions are in:

- [`src/backend/README.md`](src/backend/README.md) — `uv sync`, DB init, seed, run.
- [`src/frontend/README.md`](src/frontend/README.md) — `npm install`, dev server.

A typical local run uses SQLite (the default) and the seed data — no external dependencies required.

## 2. Read the methodology (10 minutes)

The product exists to serve a specific scouting practice. You will design and review changes much more confidently if you understand it.

In order:

1. [`docs/methodology.md`](docs/methodology.md) — the practice the tool implements (skim the section headings, read §1 and §2).
2. [`docs/assessment-criteria.md`](docs/assessment-criteria.md) — the six criteria. Skim the tables.
3. [`docs/ring-placement.md`](docs/ring-placement.md) — Invest / Pilot / Explore / Monitor.

The deeper docs ([`docs/assessment-workflow.md`](docs/assessment-workflow.md) and [`docs/assessment-api.md`](docs/assessment-api.md)) are reference material you'll come back to.

## 3. Make your first change (5 minutes)

A safe first task: pick a typo or a clarification in any `docs/` file.

```bash
git checkout -b fix/<short-name>
# edit
pre-commit run --all-files
make test
git commit -m "Fix typo in <doc>"
```

This validates that your local environment, pre-commit hooks, and test suite all work end-to-end.

## 4. Reference, for later

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — PR workflow, required checks.
- [`CONVENTIONS.md`](CONVENTIONS.md) — code and AI-agent conventions.
- [`docs/auth.md`](docs/auth.md) — authentication modes and roles, if you touch auth.
- [`docs/deployment.md`](docs/deployment.md) — deployment checklist, if you operate the app.

## Questions

If you get stuck, open an issue with the **question** label. The maintainers prefer questions in the open so other contributors benefit from the answer.
