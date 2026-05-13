# Backup

Export and restore the entire radar database.

## Downloading a backup

Click **Download backup** to receive a single archive containing every
table in the database, including media assets. The download is streamed —
large databases can take a moment.

Use the backup as:

- A point-in-time snapshot before a risky migration.
- A way to move the radar to another instance.
- An offline archive for compliance.

## Restoring

Choose a backup file, then pick a mode:

- **Fresh** — wipes the current database before importing. Use this when
  the target is empty or you intend to replace everything.
- **Addon** — merges the backup into the existing database. Rows that
  already exist (matched on natural key) generate **conflicts** that you
  resolve per row: _skip_ keeps the current row, _overwrite_ replaces it
  with the backup's version.

The inspection report shows conflicts before any rows are written, so you
can review before committing.

> Restoring is irreversible without another backup. Always download a fresh
> backup before restoring.
