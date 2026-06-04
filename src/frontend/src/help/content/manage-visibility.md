# Data Visibility

Control what each role can see. There are two matrices, each with its own
**Save** and **Reset to defaults**. **Admins always see everything** — the admin
column is locked on.

## Field visibility

Rows are sensitive fields; columns are the four roles (Public reader, Reader,
Writer, Admin). Tick a box to let that role see that field. Fields include:
linked persons, created-by, peer references, recent events, aliases, the
tax-credit candidate flag, publication links, key players, recommended next
steps, current challenges, and **assessment scores** (TRL, strategic relevance,
and the other scores travel together as one field).

The backend strips fields a caller isn't allowed to see, so hidden data never
leaves the server.

## View capabilities

The second matrix controls *affordances* rather than fields:

- **Cycle selector** — whether a role can switch to historical cycles.
- **List view** — whether a role can reach `/list` (the radar is always
  available).

## Defaults

Anything not set falls back to built-in defaults; **Reset to defaults** restores
them. Changes take effect on each role's next request.
