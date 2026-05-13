# Import

Import **peer references** — pointers to how other organisations have
classified the same technology — from a JSON export.

## Source format

Files must be in the `nodus-peer-reference` envelope format, produced by
the _Export → Peer references (JSON)_ action on another Nodus instance.

Drop one or more JSON files into the upload area to begin.

## Matching topics

The importer attempts to auto-match each incoming row to a topic in this
radar by slug, then by exact name. Rows shown as **auto-matched** can be
imported as-is; unmatched rows let you pick a target topic from a dropdown,
or untick **Include** to skip them.

## Parties

Each peer reference belongs to a _party_ (the peer organisation). Parties
not present in this instance are created on import.

## After import

Imported references appear in each topic's detail panel under _Peer
references_. You can edit or delete them from the topic detail modal.
