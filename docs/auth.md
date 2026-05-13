# Authentication & roles — operator guide

This page documents how the Technology Radar backend authenticates users and
how it enforces permissions. It is the operator-facing complement to the
methodology overview in `docs/methodology.md`.

For env-var defaults and examples, see `src/backend/.env.example`.

## The four roles

Roles live in `src/backend/app/models/user.py` (`UserRole` StrEnum). The names
in the database are lowercase; the methodology uses the CamelCase names.

| Role            | What they see                                              | What they can change                              | Methodology persona      |
|-----------------|------------------------------------------------------------|---------------------------------------------------|--------------------------|
| `PublicReader`  | Only Topics flagged public (`not_for_external_publication=False`); no PII | Nothing                                          | External viewer          |
| `Reader`        | All Topics and factsheets                                  | Nothing                                          | Radar Sponsor / business-unit readers / peer-organisation partners |
| `Writer`        | All Topics and factsheets                                  | Topics, Technologies, Persons, Media, etc.       | Advisory Group           |
| `Admin`         | Everything                                                 | Everything + Users, Settings, Backups, API keys  | Radar Curator            |

Anonymous (logged-out) requests are treated as `PublicReader` by the backend —
see `is_public_only()` in `src/backend/app/auth.py`. There is no in-between
"guest" tier; visiting the site with no token is exactly equivalent to logging
in as a PublicReader.

## Three auth modes

The backend ships with three operating modes. Pick one per deployment.

### 1. Auth disabled — `NODUS_AUTH_DISABLED=1`

Every request is treated as a synthetic admin (UUID
`00000000-0000-0000-0000-000000000001`, username `local`, role `Admin`). No
login form is needed. The frontend shows an "Auth disabled — running as local
admin" badge so this mode is obvious from the UI.

Use it for:
- Single-user local development.
- Air-gapped or kiosk-style deployments where one trusted operator runs the app.

Never use it for:
- Multi-user deployments. Anyone with network access becomes admin.

### 2. Local accounts only — default

The standard mode. Users authenticate with username + password against the
`user` table; optional TOTP MFA per user; sessions are 14-day server-side
bearer tokens (hashed at rest). Admins manage users via the `/manage/users`
UI.

Use it for:
- Small teams with no enterprise IdP.
- Pilot deployments where SSO is not yet wired up.
- Service accounts and break-glass admins alongside Entra (mode 3).

### 3. Entra ID (Azure AD) SSO + emergency local — production target

Humans authenticate via Entra (OIDC authorization-code + PKCE). The backend
maps Entra group membership → application role using operator-configured
group object IDs. A small set of local accounts remains for break-glass
admin access and service automation; API keys still work the same way.

Toggled by setting `NODUS_AUTH_ENTRA_ENABLED=1` plus the other
`NODUS_AUTH_ENTRA_*` variables (see `src/backend/.env.example` and the
walkthrough in **§ Enabling Entra SSO** below).

## Env-var summary by mode

| Variable                              | Disabled | Local | Entra | Notes |
|---------------------------------------|----------|-------|-------|-------|
| `NODUS_AUTH_DISABLED`                 | `1`      | unset | unset | Wins over everything else when set. |
| `NODUS_PUBLIC_READER_DISABLED`        | unset    | optional | optional | When `1`, anonymous + `public_reader` get 401 everywhere. |
| `NODUS_ENV`                           | optional | optional | optional | Set to `dev`/`test` to seed demo users. Never in prod. |
| `NODUS_AUTH_ENTRA_ENABLED`            | unset    | unset | `1`   | Master switch for the OIDC routes. |
| `NODUS_AUTH_ENTRA_TENANT_ID`          | —        | —     | required | Entra directory GUID. |
| `NODUS_AUTH_ENTRA_CLIENT_ID`          | —        | —     | required | App registration's application (client) GUID. |
| `NODUS_AUTH_ENTRA_CLIENT_SECRET`      | —        | —     | required | A client secret from the app registration. |
| `NODUS_AUTH_ENTRA_REDIRECT_URI`       | —        | —     | required | Must match the redirect URI registered in Entra. |
| `NODUS_AUTH_ENTRA_GROUP_{ROLE}`       | —        | —     | optional | One per role; unmatched users default to PublicReader. |

## Permission enforcement

Every router uses one of three FastAPI dependencies (defined in `auth.py`):

- `OptionalUserDep` — endpoint is public; visibility filtered by
  `is_public_only(user)` server-side.
- `WriterDep` — requires Writer or Admin. Anonymous → 401, Reader → 403.
- `AdminDep` — requires Admin. Anonymous → 401, anyone else → 403.

API keys (prefix `ntr_`) resolve to the owning user with that user's role and
are accepted on any endpoint that accepts a bearer token.

## What anonymous visitors can do (canonical contract)

- Browse the radar (`/radar`) and list view (`/list`).
- Open the detail panel for any public-flagged topic.
- Switch between historical cycles.
- Cannot see: Persons (PII), `recent_events`, `created_by`, non-public
  topics, the `/manage` section, or any mutation endpoints.

## Requiring a login for every request

If a deployment must hide the radar entirely from logged-out visitors, set
`NODUS_PUBLIC_READER_DISABLED=1`. With that flag enabled:

- Every endpoint that previously accepted anonymous callers now returns
  `401 Authentication required`.
- Accounts with role `public_reader` cannot log in (`/api/auth/login`
  returns 401) and any session/API key resolving to a `public_reader` user
  is rejected at the same chokepoint.
- Entra users who resolve to `PublicReader` (no configured group matched)
  get `403` from the callback instead of a session token.
- `GET /api/auth/config` includes `"public_reader_disabled": true` so the
  SPA can hide any "browse anonymously" affordance.

Enforcement lives in `current_user_optional()` in `app/auth.py` — a single
chokepoint covers every router that declares `OptionalUserDep`. The flag
has no effect when `NODUS_AUTH_DISABLED=1` is also set; the synthetic
admin always wins.

## Operational reminders

- Demo users (`demo_public`, `demo_reader`, `demo_writer`, `demo_admin`,
  password `demo`) only get seeded when `NODUS_ENV ∈ {dev, test}`. Production
  containers should leave `NODUS_ENV` unset.
- Server-side session tokens have a 14-day sliding TTL (`SESSION_TTL` in
  `auth.py`). Logout invalidates the row immediately.
- `NODUS_DOCS_DISABLED=1` (or `NODUS_DOCS_PASSWORD=...`) protects the
  OpenAPI surface — it does NOT gate `/api/*` endpoints.

## Previewing the public-reader surface

In `dev`/`test` environments, the easiest way to verify what an unauthenticated
visitor sees is to log in as the seeded `demo_public` user (password `demo`):
that account has role `PublicReader`, which goes through the exact same
visibility-stripping path as an anonymous request. Logging out of any session
and reloading also gives the anonymous surface.

For production debugging, set `NODUS_ENV` to `dev` temporarily on a staging
container, or create a dedicated `PublicReader` account via the
`/manage/users` page.

## Enabling Entra SSO

End-to-end checklist for an operator going from "local auth only" to
"Entra SSO + emergency local accounts." All steps must complete; a partial
setup will surface a `503 Entra SSO is not fully configured` from
`/api/auth/entra/start`.

### Step 1 — Register the app in Entra

In the [Entra admin center](https://entra.microsoft.com/) → **App
registrations** → **New registration**:

| Field                | Value |
|----------------------|-------|
| Name                 | e.g. `Technology Radar (prod)` — appears on the consent screen |
| Supported account types | "Accounts in this organizational directory only" (single tenant) |
| Redirect URI         | **Web** → `https://<your-radar-host>/api/auth/entra/callback` |

After registration, note:
- **Directory (tenant) ID** → `NODUS_AUTH_ENTRA_TENANT_ID`
- **Application (client) ID** → `NODUS_AUTH_ENTRA_CLIENT_ID`

### Step 2 — Create a client secret

App registration → **Certificates & secrets** → **New client secret**.
Pick the shortest expiry your operations process tolerates (12 months is
typical; rotate before expiry). Copy the **Value** immediately —
Entra only shows it once.

→ `NODUS_AUTH_ENTRA_CLIENT_SECRET`

### Step 3 — Configure the redirect URI(s)

App registration → **Authentication** → **Web** platform. Add every
redirect URI the deployment may use:

- Production: `https://radar.example.com/api/auth/entra/callback`
- Staging:    `https://radar-staging.example.com/api/auth/entra/callback`
- Local dev:  `http://localhost:8000/api/auth/entra/callback`

Each URI must exactly match the value the backend sends — the backend
uses whatever you put in `NODUS_AUTH_ENTRA_REDIRECT_URI`.

> The backend derives the SPA's `/auth/callback` URL by taking the
> scheme+host of the configured redirect URI. Backend and frontend
> therefore have to share an origin (or sit behind the same reverse
> proxy) for this to work without extra config.

### Step 4 — Configure ID-token group claims

App registration → **Token configuration** → **Add groups claim**.

| Setting                          | Value |
|----------------------------------|-------|
| Group types                      | **Security groups** (matches how most orgs model app roles) |
| ID token > Customize token properties | **Group ID** (the default; we use object IDs, not display names) |
| Access token / SAML              | not required |

This makes Entra emit a `groups` claim in the ID token containing the
user's transitive security-group object IDs. Without this step the
backend cannot determine a role and every Entra user lands as
`PublicReader`.

> **Overage warning.** If a user is in more than 150 security groups,
> Entra suppresses the claim and emits an overage marker instead. See
> the section below on group overage for the workaround.

### Step 5 — Create one security group per role

In **Groups** → **New group** (type: Security), create the groups your
deployment needs. You typically want at least:

- `radar-admins` — full administrative access
- `radar-writers` — Advisory Group members
- `radar-readers` — Sponsors, business-unit readers, peer-organisation partners

Add the relevant people as members. Copy each group's **Object ID** —
that's what the backend matches against, not the display name.

→ `NODUS_AUTH_ENTRA_GROUP_ADMIN`, `NODUS_AUTH_ENTRA_GROUP_WRITER`, etc.

`NODUS_AUTH_ENTRA_GROUP_PUBLIC_READER` is optional — users who are in
none of the configured groups default to `PublicReader` automatically.

### Step 6 — Grant API permissions

App registration → **API permissions** → **Add a permission** →
**Microsoft Graph** → **Delegated permissions**:

- `openid`
- `profile`
- `email`
- `User.Read`

The default consent flow handles the first three; `User.Read` is added
explicitly by the OIDC start endpoint. No admin consent is required for
delegated `User.Read` in most tenants.

If you plan to support users with >150 groups (overage), additionally
grant **`Group.Read.All`** as a Delegated permission with admin
consent — the backend will then fall back to
`/me/transitiveMemberOf` on Graph instead of relying on the
ID-token `groups` claim.

### Step 7 — Set the backend env vars

In the production environment (Azure Container App, Kubernetes secret,
`.env` file behind a reverse proxy, whatever you use), set:

```sh
NODUS_AUTH_ENTRA_ENABLED=1
NODUS_AUTH_ENTRA_TENANT_ID=<directory tenant id from step 1>
NODUS_AUTH_ENTRA_CLIENT_ID=<application client id from step 1>
NODUS_AUTH_ENTRA_CLIENT_SECRET=<client secret value from step 2>
NODUS_AUTH_ENTRA_REDIRECT_URI=https://radar.example.com/api/auth/entra/callback

NODUS_AUTH_ENTRA_GROUP_ADMIN=<object id of radar-admins>
NODUS_AUTH_ENTRA_GROUP_WRITER=<object id of radar-writers>
NODUS_AUTH_ENTRA_GROUP_READER=<object id of radar-readers>
# NODUS_AUTH_ENTRA_GROUP_PUBLIC_READER is optional — see above.
```

Make sure `NODUS_AUTH_DISABLED` is **not** set; it short-circuits every
other auth flag including Entra.

### Step 8 — Roll out and verify

After the backend restart, the boot log should print:

```
INFO  app.main: Nodus boot: auth mode = local + entra
```

If you see `local-only` instead, `NODUS_AUTH_ENTRA_ENABLED` did not reach
the process. If you see `auth-disabled (synthetic admin)`, you have
`NODUS_AUTH_DISABLED=1` set somewhere — unset it.

Quick smoke checks (browser):

1. `GET /api/auth/config` returns `{"auth_enabled": true, "providers": ["local", "entra"]}`.
2. The "Sign in" popover now shows a "Sign in with Microsoft" button above
   the local username/password form.
3. Clicking that button redirects to `login.microsoftonline.com`, you
   consent, and land back on `/auth/callback?token=…`.
4. Within a beat, the radar reloads and the account avatar in the header
   shows your role badge derived from your group membership.

`curl` smoke check (no browser):

```sh
curl -s https://radar.example.com/api/auth/config
# → {"auth_enabled":true,"providers":["local","entra"]}

curl -i https://radar.example.com/api/auth/entra/start
# → 200 with {"authorize_url": "https://login.microsoftonline.com/..."}
#   and a `Set-Cookie: nodus_oidc_state=…; HttpOnly; Secure` header.
```

### Step 9 — Keep emergency-local access working

Entra is the primary path, but local accounts remain available for:

- A break-glass admin used only if Entra is unreachable (recommended:
  one named account, MFA enabled, password stored in your secrets vault).
- Service automation via API keys (the `/manage/api` page is unaffected
  by Entra).

The local sign-in form is collapsed below the Microsoft button in the
popover, not removed. Local logins continue to hit `/api/auth/login`.

### Common failure modes

| Symptom                                              | Likely cause |
|------------------------------------------------------|--------------|
| Microsoft button missing from the popover            | `NODUS_AUTH_ENTRA_ENABLED` not set, or `/api/auth/config` returns `providers: ["local"]` only. |
| Redirect to Microsoft fails with `AADSTS50011`       | The redirect URI sent by the backend does not match any registered URI. Check `NODUS_AUTH_ENTRA_REDIRECT_URI` matches exactly (scheme, host, path, no trailing slash). |
| Callback returns `400 OIDC state cookie missing or expired` | The user took longer than 5 minutes between clicking the button and finishing the Microsoft prompt, or the SPA and backend are on different origins so the cookie was dropped. |
| Callback returns `401 Entra ID token validation failed` | The deployment's `NODUS_AUTH_ENTRA_CLIENT_ID` does not match the `aud` claim in tokens minted by this tenant, or the JWKS endpoint is unreachable. |
| Every Entra user lands as `PublicReader`             | Group claims are not configured (Step 4), the user is in no configured group, or every user is hitting the >150-group overage and `Group.Read.All` is not granted. |
| `503 Entra SSO is not fully configured`              | One of the required `NODUS_AUTH_ENTRA_*` env vars is unset or empty. The error body lists which ones. |

## Entra group → role mapping

When Entra is enabled, the backend reads four env vars at login time and
picks the highest-privilege role whose configured Entra group object ID
appears in the user's transitive group membership:

```
NODUS_AUTH_ENTRA_GROUP_ADMIN=<object-id>
NODUS_AUTH_ENTRA_GROUP_WRITER=<object-id>
NODUS_AUTH_ENTRA_GROUP_READER=<object-id>
NODUS_AUTH_ENTRA_GROUP_PUBLIC_READER=<object-id>
```

A user in no configured group defaults to `PublicReader`. On every Entra
login the role is re-derived and the local `user.role` row is updated, so
demotions/promotions in Entra propagate within one round-trip without
manual intervention. Local-only accounts (those with `user.entra_oid IS NULL`)
are never touched by group-sync.

If your Entra users belong to more than 150 groups, the `groups` claim is
suppressed by Entra in favor of an overage marker. The current
implementation treats overage users as `PublicReader`; the documented fix
is to configure smaller security groups or grant the app `Group.Read.All`
on Microsoft Graph so the backend can fall back to
`/me/transitiveMemberOf`.
