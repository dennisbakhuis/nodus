# Editing a technology

Everything about a technology is edited here. Changes are saved only when you
click **Save**; **Cancel** discards them. The **? Help** button reopens this
panel.

## Identity

- **Name** — the canonical name. Renaming keeps the existing **slug** (shown
  read-only) so links don't break.
- **Hero image** — **📷 Replace image** to upload and crop a new picture; it
  applies when you save.
- **Aliases** — other names or acronyms. They feed search and stop the same
  technology being added twice.

## Placement

- **Ring** — Invest / Pilot / Explore / Monitor. Picking a ring places the
  technology **On Radar**.
- **Segment** — the business area; exactly one.
- **Registry status** — **On Radar**, **Backlog**, or **Archive**. Switching to
  a status that needs a radar position opens a short dialog for the ring,
  segment, and a reason.
- **Visibility** — **Public** is visible to public readers; **Private** keeps it
  internal.

## Factsheet

The narrative shown on the detail page: **Summary** (short), **Description**,
**Key players**, **Recommended next steps**, and **Current challenges** — plus
**Publication links** (URL + label) and the **tax-credit candidate** flag.

These text fields accept **Markdown**, so `- ` at the start of a line makes a
bullet list, `**text**` makes bold, `[label](url)` makes a link, and `|` tables
work. Plain text is still fine — a single newline stays a line break.

## Assessment

Scored attributes, each with a notes field: **TRL** (1–9), **Time to
mainstream**, **Strategic relevance**, **Impact potential**, **Implementation
feasibility**, and **Collaboration potential**. These feed the list and radar
filters and encodings.

Use the notes for the **reasoning behind the score** — one to three sentences,
citing the evidence you used. Always leave a note for a top-of-scale rating or a
boundary call. The score is the headline; the note is what lets the next curator
check it. Notes are shown under their score on the detail page.

## People

Add owners, contributors, or experts — search the registry or add a new person,
and pick their role on this technology.

## Part of (groups)

Files this technology into a **group hierarchy** (a family such as *Generative
AI ▸ Agentic AI*). This is a taxonomy for finding and filtering — it never moves
the dot. The parent picker is split into **Groups** (pure labels), **Technology
groups** (technologies that already have children), and **Technologies**. Pick a
parent, or **— None —** for top level; a node's own descendants are hidden so you
can't create a loop. To restructure many at once, use **Manage ▸ Groups**.

## Relations

Captures **influence** between technologies — a graph, not a hierarchy (use
Groups for "is part of"). Choose a type — **Drives**, **Driven by**, **Relates
to**, **Hinders**, **Hindered by** — type a target, and **Add**. Remove one with
the **×**. Relations show on both technologies and feed the radar's connection
lines.

## Peer references

Add or edit how other organisations classify this technology — the peer
organisation, its ring/segment labels, a summary, and links.

## Versions

If the factsheet has earlier versions, a selector lets you view them. Saving
always creates a new current version, so the history is kept.
