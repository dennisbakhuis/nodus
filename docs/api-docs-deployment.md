# API documentation (Swagger UI / ReDoc) — deployment guide

FastAPI exposes three documentation routes:

| Route            | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `/docs`          | Swagger UI — interactive, with "Try it out" buttons                        |
| `/redoc`         | ReDoc — read-only, navigable reference                                     |
| `/openapi.json`  | Machine-readable schema (also consumed by `pnpm gen:api` in the frontend)  |

All three are served by the backend at the same origin as the API. They are **not** proxied through the vite dev server by default — see [Local development](#local-development) below.

The three things to think about for production deployments (Azure Container Apps, etc.) are: public-exposure posture, root-path prefixing, and self-hosted assets. All of them are controlled by environment variables; no code changes per environment.

---

## Configuration matrix

| Variable                  | Default                                                            | Effect                                                                                       |
| ------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `NODUS_DOCS_DISABLED`     | unset                                                              | When `1`/`true`/`yes`, `/docs`, `/redoc`, and `/openapi.json` all return `404`.              |
| `NODUS_DOCS_PASSWORD`     | unset                                                              | When set, all three docs routes require HTTP Basic auth.                                     |
| `NODUS_DOCS_USERNAME`     | `admin`                                                            | Username for HTTP Basic auth. Only used when `NODUS_DOCS_PASSWORD` is set.                   |
| `NODUS_ROOT_PATH`         | empty                                                              | URL path prefix the app is mounted under (e.g. `/radar`).                                    |
| `NODUS_SWAGGER_JS_URL`    | `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js` | Swagger UI bundle URL.                                                                       |
| `NODUS_SWAGGER_CSS_URL`   | `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css`    | Swagger UI stylesheet URL.                                                                   |
| `NODUS_REDOC_JS_URL`      | `https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js` | ReDoc bundle URL.                                                                            |

`NODUS_DOCS_DISABLED` takes precedence over `NODUS_DOCS_PASSWORD` — if disabled, the routes are not registered at all.

---

## 1. Public-exposure posture

Pick one of three postures:

### a. Open (default — fine for local dev or behind private ingress)

Set nothing. `/docs`, `/redoc`, `/openapi.json` are reachable to anyone who can hit the backend ingress.

This is the right choice when the container has no public ingress (e.g. internal-only Azure Container App reachable only inside a VNet).

### b. HTTP Basic auth (recommended baseline for public ingress)

```
NODUS_DOCS_PASSWORD=<some-strong-secret>
NODUS_DOCS_USERNAME=admin   # optional, defaults to "admin"
```

Visiting `/docs` triggers a browser-native credential prompt. The same credentials are needed for `/openapi.json`, so Swagger UI's `Try it out` and `gen:api` keep working once authenticated. Credentials are checked with constant-time comparison.

This is the smallest change with the biggest safety improvement — it keeps the tool available to your team without exposing the entire API surface to the world.

### c. Disabled

```
NODUS_DOCS_DISABLED=1
```

The three routes return `404`. Most defensive — useful when there's no operator need for live docs in that environment.

---

## 2. Path prefix (`NODUS_ROOT_PATH`)

If the container is mounted at the **root** of the ingress URL (typical for Container Apps with default routing), leave `NODUS_ROOT_PATH` unset.

If the container is behind a reverse proxy that strips a prefix — e.g. `https://api.example.com/radar/*` is rewritten to `/*` before reaching the app — set:

```
NODUS_ROOT_PATH=/radar
```

This tells FastAPI to:

- Render the Swagger UI's `openapi.json` reference as `/radar/openapi.json`, so the browser fetches the right URL.
- Prefix every "Try it out" request URL with `/radar` so they hit the proxy at the externally-visible path.

Without this, Swagger loads but `Try it out` calls hit the wrong path and you'll see 404s from the proxy.

---

## 3. Self-hosted Swagger / ReDoc assets

By default the docs HTML loads Swagger UI's and ReDoc's JS/CSS from `cdn.jsdelivr.net`. This is fine in most environments but **silently breaks** when:

- The container has restricted egress (deny-list firewall, no internet access).
- A Content Security Policy excludes `cdn.jsdelivr.net`.
- The CDN is blocked or rate-limited from your runtime region.

The failure mode is unhelpful: `/docs` renders as a blank page (or `Failed to load API definition`), no useful error in logs.

To self-host, mirror the three assets somewhere reachable from inside your network (Azure Storage static website, an internal CDN, a sidecar nginx, etc.) and point the env vars at them:

```
NODUS_SWAGGER_JS_URL=https://internal-cdn.example.com/swagger-ui/swagger-ui-bundle.js
NODUS_SWAGGER_CSS_URL=https://internal-cdn.example.com/swagger-ui/swagger-ui.css
NODUS_REDOC_JS_URL=https://internal-cdn.example.com/redoc/redoc.standalone.js
```

Pin versions in the URLs to avoid surprises on CDN refresh:

- Swagger UI: `swagger-ui-dist@5.x` from `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/...`
- ReDoc: `redoc@next` works for most cases; pin to a specific version for reproducibility.

---

## Local development

`vite.config.ts` proxies `/api`, `/docs`, `/redoc`, and `/openapi.json` from the frontend dev server (`:5173`) to the backend (`:8000`). So you can hit any of:

- `http://localhost:5173/docs` (via vite proxy)
- `http://localhost:8000/docs` (direct to backend)

Both work and show the same Swagger UI. In local dev no auth env vars are set, so docs are open.

The frontend's `pnpm gen:api` script fetches the schema from `http://localhost:8000/openapi.json` directly (not via vite). If you have `NODUS_DOCS_PASSWORD` set locally, override `gen:api` with credentials inline or temporarily unset the env var.

---

## Recommended starting point for Azure Container Apps

For a typical "internal tool exposed via public ingress" deploy:

```
NODUS_DOCS_PASSWORD=<rotate-this-secret>
NODUS_CORS_ORIGINS=https://radar.example.com
NODUS_ENV=prod
```

Leave `NODUS_ROOT_PATH` and the asset URLs unset unless you actively need them.

Rotate `NODUS_DOCS_PASSWORD` whenever team membership changes. Store it as a Container Apps secret reference rather than a plain env var.
