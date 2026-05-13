# Contributing to Nodus

Thanks for considering a contribution. This guide covers local setup, the change workflow, and the checks your contribution must pass before it can be merged.

## One-time setup

You need `uv` for Python and `node` (LTS) for the frontend.

```bash
# clone and enter the repo
git clone https://github.com/dennisbakhuis/nodus.git
cd nodus

# install pre-commit hooks (runs ruff, mypy, eslint, prettier, tsc, gitleaks on every commit)
uv tool install pre-commit
pre-commit install

# see what's available
make help
```

Backend and frontend each have their own README with the install commands for their stack:

- [`src/backend/README.md`](src/backend/README.md) — `uv sync`, DB init, CLI commands.
- [`src/frontend/README.md`](src/frontend/README.md) — `npm install`, dev server, build commands.

## Workflow

1. Open or pick an issue. For non-trivial changes, discuss the approach first.
2. Branch off `main`: `git checkout -b feature/<short-name>` or `fix/<short-name>`.
3. Make changes, keeping commits focused and present-tense ("Add ring-placement doc", not "Added").
4. Update or add docs and tests where relevant.
5. Run the local checks before pushing (see below).
6. Open a pull request targeting `main`. Include a short summary and a manual-test checklist.

## Required checks before opening a PR

```bash
# format + lint + type-check + secret scan (everything in pre-commit)
pre-commit run --all-files

# full test suite
make test

# end-to-end tests (only if your change affects frontend behaviour)
make test-e2e
```

The same checks run in CI. PRs cannot merge with failing checks.

## Code conventions

See [CONVENTIONS.md](CONVENTIONS.md). The short version:

- Python: no inline comments, numpy-style docstrings, `uv` for everything.
- TypeScript: existing folder structure, ESLint + Prettier (do not bypass formatting).
- Filenames: hyphenated lowercase for docs.
- Commits: imperative present tense, one logical change per commit.

## Reporting bugs

Open a GitHub issue with steps to reproduce, expected vs. actual behaviour, and your environment (OS, Python version, browser).

## Documentation changes

Docs-only PRs are welcome and follow the same workflow. The documentation index lives in [`docs/README.md`](docs/README.md); add new docs there as well as in the root [`README.md`](README.md) doc index.
