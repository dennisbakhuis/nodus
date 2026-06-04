# API

Read the radar programmatically and mint long-lived API keys.

## Getting started

The API base path is `/api`. Interactive docs are built in — **Swagger UI** at
`/docs` and **ReDoc** at `/redoc` — and this page lists common endpoints with
ready-to-copy `curl` and Python examples.

## Authentication

Send your key as a bearer token:

```
Authorization: Bearer ntr_<your-key>
```

A key inherits its owning user's role at request time. MFA does not apply to API
keys.

## Creating a key

Click **Create new key** and set a **name**, optional **description**, the
**"Acts as"** user it runs as (any active user; defaults to you), and an optional
**expiry date**. The token is shown **once** — copy it and tick the
acknowledgement before closing; it can't be retrieved later.

## Managing keys

The table lists each key's name, owner, prefix, created / last-used / expiry, and
status. **Revoke** disables a key immediately (irreversible; confirm when asked),
and **Show revoked** reveals revoked keys. To rotate, create a new key, deploy
it, then revoke the old one. There is no rate limit yet, and never put a token in
a URL query string.
