# Import References

Bring in **peer references** — how other organisations classify the same
technologies — from a JSON export (the `nodus-peer-reference` format produced by
another Nodus instance's peer-reference export).

Three steps:

## 1. Upload

Choose one JSON file. The app reads its **peer organisation** and **source**,
which you can edit before importing: name, slug, website, and the source name and
URL (name and source name are required). It shows whether the party **matches an
existing** one or **will be created**.

## 2. Review & link

Each incoming reference is matched to a local technology — automatically by slug,
then by exact name. For each row you can pick a different target from the dropdown
(or **skip** it), and the **Action** chip shows whether it will **add a new**
reference or **overwrite** an existing one for that party. Bulk actions let you
select all matched rows or none.

## 3. Import

Run a **preview (dry run)** first — it summarises what will happen: party and
source resolved or created, matched/unmatched counts, references added or
updated, and URLs added. Then **Import** to commit.

Imported references appear in each technology's detail panel under *Peer
references*.
