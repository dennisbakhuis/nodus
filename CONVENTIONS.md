# Conventions

Binding conventions for every contributor to this repository, human and AI agent. These are short rules with a clear default — when in doubt, follow them.

## Filenames and structure

- Lowercase, hyphenated filenames for docs and config (`assessment-criteria.md`, not `assessment_criteria.md`).
- Python modules use snake_case (`auth_entra.py`); TypeScript files use the convention of their existing folder.
- New top-level documents live in `docs/`. Project-meta files (`LICENSE`, `CONTRIBUTING.md`) live at the repo root.

## Python

- Managed by `uv`. Use `uv run <script>` rather than activating the venv manually.
- **No inline comments.** Python is self-documenting through clear naming and structure. Add a comment only when the *why* is non-obvious (a workaround, a subtle invariant, a constraint from elsewhere).
- Use concise numpy-style docstrings for public functions, classes, and methods. Single-line for trivial cases; full parameter/return blocks for non-trivial ones.
- Lint and type-check with `ruff` and `mypy` — both run in pre-commit.

## TypeScript / Frontend

- `npm` for dependency management; scripts defined in `package.json`.
- ESLint + Prettier enforced via pre-commit. Do not bypass formatting.
- Match the existing component structure in `src/frontend/src/`.

## Commits

- Imperative, present tense: "Add ring-placement doc", not "Added" or "Adds".
- Reference issue numbers when applicable.
- One logical change per commit. Squash trivial fixups before pushing.
- Pre-commit hooks **must** pass. Do not commit with `--no-verify` unless explicitly approved.

## Branches and pull requests

- `feature/<short-name>` or `fix/<short-name>` off `main`.
- PRs target `main`. Include a short summary and a manual-test checklist.
- All status checks and at least one review approval before merge.

## AI-agent contract

When an AI agent (Claude Code, Copilot, Cursor, etc.) modifies this repository:

- Follow this document as if it were a human contributor's checklist.
- Read the relevant `docs/` files before designing changes — especially [docs/methodology.md](docs/methodology.md) when touching assessment, factsheet, ring, or movement-event code.
- Do not create new top-level documents or directories without explicit instruction.
- Do not invent or guess external URLs, vendor names, or library APIs — verify against the codebase or ask.
- When in doubt about scope, ask before acting rather than implementing speculatively.

## See also

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup and PR workflow.
- [docs/README.md](docs/README.md) — full documentation index.
