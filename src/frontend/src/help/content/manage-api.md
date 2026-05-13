# API access

Manage API keys that allow programmatic clients to read or modify the
radar without going through a browser sign-in.

## Creating a key

Click **New API key**, give it a descriptive label (e.g. _CI exporter_),
and choose an owning user. The key inherits that user's role — a key
created for a _reader_ can read; a key for a _writer_ can also create and
update.

The key string is shown **once** at creation. Copy it into your secret
manager before closing the dialog. It cannot be recovered later.

## Using a key

Send it on every request as a header:

```
Authorization: Bearer <api-key>
```

The API base path is `/api`. See `docs/assessment-api.md` for endpoint
documentation.

## Revoking

Click **Revoke** on the row to disable a key immediately. Revoking is
irreversible; create a new key if you need it back.

## Rotation

Best practice: create a new key, deploy it everywhere, then revoke the old
one. Avoid revoking before the new key is in production.
