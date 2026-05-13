#!/usr/bin/env bash
# Bump the canonical project version.
#
# Usage:
#   scripts/bump-version.sh 0.2.0
#
# Architecture:
#   - VERSION is the SINGLE canonical source of truth.
#   - src/backend/pyproject.toml uses dynamic = ["version"] + Hatch's
#     regex source, so it reads VERSION directly. No edit needed there.
#   - src/frontend/vite.config.ts reads VERSION at build time, so the
#     frontend bundle's __APP_VERSION__ comes from VERSION directly.
#   - src/frontend/package.json keeps a version field because npm requires
#     one; this script syncs it for tooling sanity even though no code
#     reads it.
#   - Lockfiles are re-locked so dependency resolution stays reproducible.
#
# Does NOT commit, tag, or push. Combine with `make release` for that.

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <new-version>" >&2
    exit 2
fi

NEW_VERSION="$1"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Sanity-check: semver-ish (digits.digits.digits with optional pre-release / build tag)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ]]; then
    echo "Error: '$NEW_VERSION' is not a valid SemVer (X.Y.Z)." >&2
    exit 2
fi

cd "$REPO_ROOT"

# 1. Update the canonical source.
echo "$NEW_VERSION" > VERSION

# 2. Sync package.json (npm requires a version field; not read by app code).
uv run --quiet python - "$NEW_VERSION" <<'PY'
import re, sys
new = sys.argv[1]
path = "src/frontend/package.json"
text = open(path).read()
text = re.sub(r'(?m)^(  "version":\s*)".*"', rf'\1"{new}"', text, count=1)
open(path, "w").write(text)
PY

# 3. Re-lock so dependency resolution stays reproducible.
(cd src/backend && uv lock --quiet) || true
(cd src/frontend && npm install --silent --package-lock-only) || true

echo "Bumped to $NEW_VERSION. Files changed:"
git diff --stat -- VERSION src/backend/uv.lock src/frontend/package.json src/frontend/package-lock.json
