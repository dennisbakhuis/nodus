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

### Naming convention

A registry is only searchable if its names are predictable. Nodus does not
enforce these, but a catalogue that ignores them accumulates duplicates that are
invisible until someone reads the whole list.

- **One language.** Pick one and stay in it — a catalogue with _Quantum
  Technologies_ and _Quantum technologie_ has two entries for one thing.
- **Title Case**, and one spelling system throughout. Do not let
  _Optimisation_ and _Optimization_ both exist.
- **A noun phrase for the thing itself**, not for the benefit or the project.
  _Dynamic Line Rating_, not _Getting More From Existing Lines_.
- **Acronym or expansion, never both.** _HVDC_ or _High Voltage Direct
  Current_ — pick one for the name and put the other in **Aliases**, which is
  what stops the duplicate.
- **Spell "and", and treat it as a warning.** A conjunction in a name usually
  means two technologies wearing one entry — _Federated Learning and Data
  Fusion_ is really _Federated Learning_.
- **Singular**, unless the thing is only ever plural (_Data Spaces_).
- **No vendor or product names.** _Low-Code Platforms_, not _Mendix_. A named
  product belongs in **Key players** on the factsheet.
- **Never let _Advanced_, _Smart_, _Innovative_, _Emerging_, _New_ or
  _Next-Generation_ be the word that distinguishes an entry.** If removing it
  collides with another entry, you have found a duplicate, not a new
  technology.

The last two are where most duplicates come from. Before adding anything, read
the duplicate warning Nodus shows as you type — it is matching aliases too.

## Placement

- **Ring** — Invest / Pilot / Explore / Monitor. Picking a ring places the
  technology **On Radar**.
- **Segment** — the business area; exactly one.
- **Registry status** — **On Radar**, **Backlog**, **Adopted**, or **Archive**.
  Switching to a status that needs a radar position opens a short dialog for the
  ring, segment, and a reason. Leaving **On Radar** clears the ring and segment,
  because only a radar entry holds a position on the wheel.

  **Adopted** and **Archive** are both terminal and mean opposite things. Use
  **Adopted** when the technology is in normal use and no decision about it
  remains — the successful exit. Use **Archive** when it was dropped or has
  faded. Keeping them apart is what lets the radar show what it delivered rather
  than only what it abandoned.
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
the dot. A technology has **exactly one** parent; if it seems to need two, see
**Relations** below. The parent picker is split into **Groups** (pure labels), **Technology
groups** (technologies that already have children), and **Technologies**. Pick a
parent, or **— None —** for top level; a node's own descendants are hidden so you
can't create a loop. To restructure many at once, use **Manage ▸ Groups**.

## Relations

Captures **influence** between technologies — a graph, not a hierarchy. Choose a
type — **Drives**, **Driven by**, **Relates to**, **Hinders**, **Hindered by** —
type a target, and **Add**. Remove one with the **×**. Relations show on both
technologies and feed the radar's connection lines.

**Groups say what something _is_. Relations say what something _touches_.** If
you are about to record that A is a kind of B, that is a group, not a relation.

Because a technology has exactly one parent, a relation is also how you record a
**second, secondary family**: file it under its primary group, then add a
`Relates to` pointing at the other group — a relation may target a group node,
not just a technology. Use it when the membership is real but not what the thing
_is_; if you need it often, the taxonomy needs fixing instead.

Two habits worth keeping:

- **Prefer a typed relation to `Relates to`.** _Drives_ and _Hinders_ carry
  direction and meaning; `Relates to` is a catch-all and a registry full of it
  tells a reader nothing. Add the reciprocal so the graph reads both ways.
- **A relation should teach someone something.** "Both are digital" is not a
  relation. If you cannot say what a reader learns from the link, leave it out.

## Peer references

Add or edit how other organisations classify this technology — the peer
organisation, its ring/segment labels, a summary, and links.

## Versions

If the factsheet has earlier versions, a selector lets you view them. Saving
always creates a new current version, so the history is kept.
