# syntax=docker/dockerfile:1.7

# Stage 1: Build the Vite frontend
# Pulled from Microsoft Container Registry (Azure Linux) to avoid Docker Hub
# rate limits on shared ACR build agents. Has node + npm out of the box.
FROM mcr.microsoft.com/azurelinux/base/nodejs:24 AS frontend-build
WORKDIR /app/frontend

# vite.config.ts reads ../../VERSION at build time, which resolves to /VERSION
# in this stage.
COPY VERSION /VERSION

COPY src/frontend/package*.json ./
RUN npm ci

COPY src/frontend/ ./
RUN npm run build

# Stage 2: Python runtime with uv-managed deps + bundled frontend assets
# Pinned to 3.14 because pyproject.toml requires-python = ">=3.14".
FROM python:3.14-slim-bookworm AS runtime

# APP_VERSION is the canonical version, passed in by the build command:
#   docker build --build-arg APP_VERSION=$(cat VERSION) ...
# It feeds the OCI labels below and is the source of truth that the running
# app reads via the VERSION file copied into ./app.
ARG APP_VERSION="0.0.0+unknown"

LABEL org.opencontainers.image.title="Nodus" \
      org.opencontainers.image.description="Self-hosted Technology Radar webapp" \
      org.opencontainers.image.source="https://github.com/dennisbakhuis/nodus" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

# uv binary is copied from the official distroless image — avoids pulling
# pip + curl just to install a single tool.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Dep layer: copy only manifests first so `uv sync` is cached across code
# changes. `--frozen` requires uv.lock to match pyproject.toml.
COPY src/backend/pyproject.toml src/backend/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Application source
COPY src/backend/app ./app

# VERSION fallback for _resolve_version(): when the package is not installed
# (we use --no-install-project for build-cache friendliness), main.py reads
# the version from this file.
COPY VERSION ./app/VERSION

# Frontend build output served by FastAPI's StaticFiles mount (see
# app/main.py — mount is conditional on this directory existing).
COPY --from=frontend-build /app/frontend/dist ./static

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
