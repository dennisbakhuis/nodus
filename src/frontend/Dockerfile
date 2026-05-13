# Frontend-only image used by docker-compose for local development.
# The root Dockerfile builds the frontend in-stage and bundles it into the
# backend image for the single-container production deployment.

ARG REGISTRY=
FROM ${REGISTRY}node:24-alpine AS build

# APP_VERSION is the canonical version. docker-compose's build context is
# this directory (not the repo root), so the parent VERSION file isn't in
# scope — pass it as a build arg instead:
#   docker build --build-arg APP_VERSION=$(cat ../../VERSION) ...
# vite.config.ts reads ../../VERSION (relative to WORKDIR=/app), which
# resolves to /VERSION inside this stage.
ARG APP_VERSION="0.0.0+unknown"
RUN echo "$APP_VERSION" > /VERSION

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM ${REGISTRY}nginx:1.27-alpine

ARG APP_VERSION="0.0.0+unknown"

LABEL org.opencontainers.image.title="Nodus (frontend)" \
      org.opencontainers.image.description="Nodus Technology Radar frontend (nginx)" \
      org.opencontainers.image.source="https://github.com/dennisbakhuis/nodus" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${APP_VERSION}"

COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod -R o+r /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
