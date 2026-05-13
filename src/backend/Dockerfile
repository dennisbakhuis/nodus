# Backend-only image used by docker-compose for local development and as the
# single-service deployment target when the frontend is hosted separately
# (e.g. Azure Static Web Apps). The root Dockerfile bundles frontend+backend
# into one image for the single-container deployment pattern.

ARG REGISTRY=

FROM ${REGISTRY}python:3.14-slim-bookworm

# APP_VERSION is the canonical version. docker-compose's build context is
# this directory (not the repo root), so the parent VERSION file isn't in
# scope — pass it as a build arg instead:
#   docker build --build-arg APP_VERSION=$(cat ../../VERSION) ...
ARG APP_VERSION="0.0.0+unknown"

LABEL org.opencontainers.image.title="Nodus (backend)" \
      org.opencontainers.image.description="Nodus Technology Radar backend API" \
      org.opencontainers.image.source="https://github.com/dennisbakhuis/nodus" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY app ./app

# Persist the version so _resolve_version() finds it when the package is
# not installed inside the container.
RUN echo "$APP_VERSION" > ./app/VERSION

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
