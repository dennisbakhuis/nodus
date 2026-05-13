# Visibility

Control which fields each role can see in the topic detail and radar API.

Each row is a field; each column is a role. Tick the box if that role
should be allowed to see that field.

## How it works

The backend enforces visibility on every API response — fields the caller
isn't allowed to see are stripped before serialisation. The UI also hides
hidden fields, so a public reader sharing their screen will not accidentally
leak sensitive context.

## Defaults

Fields not listed here fall back to the backend defaults (`DEFAULT_FIELD_ROLES`).
Adding a field to this matrix overrides those defaults; removing it restores
them.

## Strategic relevance and TRL

These two fields are common candidates for hiding from public readers — they
encode internal positioning that may be commercially sensitive.

> Changes take effect on the next API request from each client. There is no
> need to restart anything.
