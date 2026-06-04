# Backup & Restore

Export and re-import the entire database — topics, technologies, factsheets,
people, settings, and media.

## Downloading a backup

Optionally set a **password** to wrap the archive in **AES-256-GCM** encryption
(a `.bin` file); leave it blank for a plain `.zip`. The download streams with a
progress indicator.

Use a backup as a point-in-time snapshot before a risky change, to move data to
another instance, or as an offline archive.

## Restoring

Three steps:

1. **Choose file** — pick the `.zip`/`.bin`, enter its **password** if encrypted,
   and choose a **mode**:
   - **Add-on (merge)** *(default)* — merges into the current data. Rows that
     already exist become **conflicts** to resolve.
   - **Fresh install (wipe first)** — wipes every table, then loads the backup
     (a confirm step lists exactly what will be cleared).
2. **Inspect** — reads the file and reports the format version, export date,
   whether it's encrypted, per-table row counts, and any conflicts. Nothing is
   written yet.
3. **Apply** — for add-on conflicts, set each to **Skip** (keep current) or
   **Overwrite** (take the backup's), with *Set all skip / overwrite* shortcuts.
   The result shows how many rows were inserted, overwritten, and skipped.

> Restoring can't be undone — download a fresh backup first.
