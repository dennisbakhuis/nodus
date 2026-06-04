# Nodus guide

## Introduction

Nodus is a technology-radar tool: it helps a team spot emerging technologies,
judge them, and publish clear recommendations. The radar shows *what to do* about
each technology at a glance; everything else in Nodus exists to produce and keep
that picture current.

This guide has two halves. **The methodology** explains the thinking behind a
radar — the scouting loop, how technologies are assessed, and how the picture
stays simple. The chapters after it are a tour of **using Nodus**: getting around,
roles and access, exploring, curating technologies, running cycles, and
administration.

Every page also has its own **Help** button (top right) for page-specific detail;
this guide is the bigger picture. Use the chapter list on the left to jump around.

## The methodology

Technology scouting is the deliberate practice of spotting emerging technologies
early, judging what they mean for your organisation, and turning that into clear
recommendations. Done casually it's just news-reading; done deliberately it
becomes a repeatable process with a memory. The radar is the visible tip of that
process — behind each dot is a registry entry, an assessment, and a
recommendation.

### The scouting cycle

Scouting runs as a loop, not a one-off project:

1. **Sense** — gather signals about new or shifting technologies.
2. **Capture** — record each one so nothing is lost.
3. **Assess** — score it against shared criteria.
4. **Recommend** — decide what to do and place it on a ring.
5. **Communicate** — publish the radar and supporting material.
6. **Revisit** — re-examine prior judgements next time.

Each turn of the loop is a **cycle**, typically run quarterly or biannually.

> **In Nodus** — a cycle is a real object in **Manage ▸ Cycles**. Open one with
> **New Cycle**, work it through the loop, then **Close cycle & freeze snapshot**
> to lock that edition and start the next baseline.

### Sensing: finding technologies

Signals come from many channels — research, vendors, conferences, internal teams,
customers, and peers. Two habits keep sensing healthy:

- **Avoid source capture.** If every signal comes from one vendor or analyst, the
  radar reflects their agenda, not reality. Vary your sources deliberately.
- **Separate signal from noise.** A single mention is noise; a pattern across
  independent sources is signal. Capture early, but don't promote on hype alone.

> **In Nodus** — capture a new technology with **+ Add**. Leave it in **Backlog**
> if it's just a signal, or place it on the radar straight away. **Manage ▸
> Import References** pulls in how peers classify the same technologies.

### The technology registry

The **registry** is the single list of every technology you're tracking, whether
or not it's on the radar today. It's the system's memory.

Each entry has a lifecycle status:

- **Backlog** — captured and tracked, not yet placed on the radar.
- **On Radar** — actively shown as a dot, with a ring and a segment.
- **Archive** — retired from the current radar but kept for history.

Keeping archived and backlog items means you can answer "what did we think last
year?" and "what did we choose not to pursue?".

> **In Nodus** — the registry is the **List** view. Filter by **Registry Status**
> to see Backlog intake, the live radar, or the archive. Archiving never deletes.

### Assessing a technology

Assessment turns opinion into a comparable judgement by scoring each technology
against shared **criteria**. The point isn't a precise number; it's a consistent,
explainable basis for comparison so two reviewers reach similar conclusions.
Record the *reasoning*, not just the score — that's what makes a recommendation
defensible, and what you revisit when circumstances change.

> **In Nodus** — the edit modal's **Assessment** section captures **TRL**, **Time
> to mainstream**, **Strategic relevance**, **Impact potential**, **Implementation
> feasibility**, and **Collaboration potential**, each with a notes field for the
> reasoning.

### Recommendation levels

The radar's **rings** express how committed the organisation is — the single most
important signal, "what to do next":

| Ring        | Meaning                                         |
| ----------- | ----------------------------------------------- |
| **Invest**  | Actively adopted; we are scaling it up.         |
| **Pilot**   | Running a meaningful trial; learning fast.      |
| **Explore** | Worth a closer look; small experiments allowed. |
| **Monitor** | On our radar, but no investment yet.            |

Time horizon ("when") is kept as metadata, not a second axis — so the picture
stays simple and one position always means one decision.

> **In Nodus** — set the **Ring** in the edit modal; choosing a ring places the
> technology **On Radar**, with a short dialog to capture the placement and a
> rationale.

### Communicating with the radar

The **radar** plots each technology by **segment** (the slice — an area of the
business) and **ring** (distance from the centre — commitment). Position is the
message: a glance tells a reader what to do. To keep that message clear, the radar
stays deliberately simple:

- **Segments** are few and stable — a long-lived, coarse taxonomy.
- **Groups** are a finer, optional taxonomy (families like *Generative AI ▸
  Agentic AI*) that highlight members without moving a dot.
- **Relations** capture influence between technologies — a separate idea from
  grouping.

> **In Nodus** — re-encode dots by colour and shape, filter the view, and
> **Export** to SVG / PNG / PDF. **Presentation mode** runs the radar as a
> self-advancing display.

### Governance & cadence

A radar needs owners and a rhythm:

- **Roles** — someone curates the registry, reviewers assess, and a steward owns
  the published radar.
- **Cadence** — run the cycle on a predictable schedule so the radar stays current.
- **Revisit prior judgements** — each cycle, deliberately re-open a few past
  calls. Technologies move; an honest radar moves with them.

> **In Nodus** — roles live in **Manage ▸ Users**; **Manage ▸ Data Visibility**
> controls what each role sees; cadence is the cycle rhythm; **Backup & Restore**
> keeps a safe copy of every edition.

### The factsheet

Each technology can carry a **factsheet** — the fuller story behind the dot:
description, assessment rationale, owners and contributors, links, and peer
references. The radar shows the decision; the factsheet shows the evidence.

> **In Nodus** — the factsheet is the technology's detail page, edited in the
> **✎ Edit** modal. Every save creates a new **version**, so its history is kept.

## Getting around Nodus

Nodus has four workspaces, reached from the tabs in the top bar. On every page the
**Help** button explains what you're looking at, and this **Guide** is the bigger
picture.

### The four workspaces

- **Radar** — the picture: technologies plotted by segment and ring.
- **List** — the same data as a sortable, filterable table (the registry).
- **Manage** — where writers and admins configure everything.
- **Guide** — this handbook.

The **List** and **Manage** tabs appear only if your role allows them.

### Opening a technology

Click any dot (on the radar) or row (on the list) to open its **detail panel**.
From there, **Open full detail** shows the complete factsheet, and writers get an
**✎ Edit** button to change it.

## Roles & access

Nodus has four roles, each building on the previous, plus fine-grained control
over what each role sees and can reach.

### The four roles

| Role              | What they can do                                                                       |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Public reader** | Anonymous visitor (no sign-in). Sees the radar and only the fields marked public.      |
| **Reader**        | Signed in. Sees the full radar and technology detail.                                  |
| **Writer**        | Reader + add and edit technologies, run cycles, and manage groups, people, and imports.|
| **Admin**         | Writer + manage users, segments, data visibility, settings, backups, and API keys.     |

### What each role can see

Sensitive fields on a technology (assessment scores, owners, publication links,
and more) can be shown or hidden per role in **Manage ▸ Data Visibility**. The
server strips anything a role isn't allowed to see, so hidden data never leaves
the system — even through the API.

### What each role can reach

The same page controls two **capabilities**: whether a role can open the **List**
view and whether it can switch to **historical cycles**. The radar itself is
always available.

### Accounts and sign-in

Accounts live in **Manage ▸ Users**, where admins create users, set roles, reset
passwords, and deactivate or delete accounts. Where single sign-on (Entra) is
enabled, those users are provisioned and role-synced automatically from their
group membership.

## Exploring the radar and list

The radar and the list are two views of the same data — a picture for
communicating, a table for working.

### Reading the radar

Each technology is a dot placed by **segment** (the slice) and **ring** (distance
from the centre). Click a dot for its detail, click a segment to zoom in (**Esc**
to zoom out), and scroll to zoom or drag to pan. The zoom row at the top of the
sidebar does the same.

### Colour and shape

By default dots are coloured by segment. You can re-encode them — **Color dots
by** ring, TRL, time to mainstream, strategic relevance, or movement; **Shape dots
by** plain dot or movement — to make one dimension pop.

### Filtering and search

The **Filters** section narrows what stands out: matching dots stay bright and the
rest dim, so nothing moves. Filter by segment, ring, movement, strategic
relevance, people, and the **TRL** and **Time to mainstream** range sliders, or
**search** by name. The **↺** by the Filters heading clears everything.

### The group filter

If technologies are organised into families, the **Group** filter shows them as a
collapsible tree; the **1 / 2 / 3** buttons unfold it to a depth. Selecting a group
highlights its members — a cross-cutting lens that never moves a dot.

### Movement between cycles

**Movement** marks what is **New**, **Promoted**, **Demoted**, or **Unchanged**
since the previous cycle. Filter by it — or encode it as colour or shape — to focus
a review on what actually changed.

### The list view

The **List** shows the same technologies as a table you can sort, filter by
registry status, visibility, and completeness, **group by family**, select rows,
and export. It's the fastest way to scan or bulk-review many technologies.

## Curating technologies

Writers build and maintain the registry — from first capture to a full factsheet.

### Adding to the registry

Use **+ Add** to create a technology. Keep it in **Backlog** while it's just a
signal, or place it **On Radar** with a ring and segment. Nodus warns about
possible duplicates as you type, so the same technology isn't added twice.

### The lifecycle

A technology moves through **Backlog → On Radar → Archive**. Archiving retires a
dot from the current radar without deleting it, so its history stays in the
registry.

### Editing a technology

The **✎ Edit** modal holds every detail, grouped into sections:

- **Identity** — name, aliases, hero image.
- **Placement** — ring, segment, registry status, public/private visibility.
- **Assessment** — the scored criteria, each with notes.
- **Factsheet** — summary, description, key players, next steps, challenges, and
  publication links.

The modal's own **? Help** button explains each field.

### Groups and relations

Two different ways to connect technologies:

- **Part of (groups)** files a technology into a **family** — a hierarchy for
  navigation and filtering that never moves the dot.
- **Relations** record **influence** (drives, driven by, relates to, hinders,
  hindered by) — a graph, shown as connection lines on the radar.

### People and peer references

Link **people** (owners, contributors, experts) from the shared registry, and add
**peer references** showing how other organisations classify the technology.

### Versions and history

Every save creates a new **version** of the factsheet, so you can see how an
entry's story changed over time.

## Cycles & publishing

A **cycle** is one edition of the radar. Cycles give the radar its rhythm and its
record.

### Running a cycle

In **Manage ▸ Cycles**, open a cycle with **New Cycle** (a name, start date, and
colour). Work the scouting loop within it — capture, assess, and place
technologies — over the cycle's period.

### Closing and freezing

When the edition is done, **Close cycle & freeze snapshot** locks a snapshot of
every On-Radar technology and starts the next baseline. Closed cycles stay
viewable on the radar and the list.

### Deliverables

Each closed cycle produces downloads: a **Radar JSON**, **Summary Brief**,
**Detailed Report**, and **Delta Document** (what changed since the previous
cycle).

### Exporting and presenting

Beyond cycle deliverables, **Export** the live radar to **SVG**, **PNG**, or
**PDF**, or turn on **Presentation mode** (in **Settings**) to run it as a
self-advancing display for screens and meetings.

## Administration

Admins configure the rest of the system from **Manage**. Each page has its own
**Help** button with step-by-step detail.

### Segments and groups

**Segments** are the radar's slices and their themes; **Groups** are the optional
technology families. Together they shape how the picture reads.

### Users and access

**Users** holds the accounts and roles; **Data Visibility** decides what each role
sees and can reach. Together they control who can do and see what.

### Settings and branding

**Settings** covers organisation details, the radar's centre logo, and
presentation-mode behaviour.

### Backup, restore, and import

**Backup & Restore** exports or re-imports the whole database (optionally
encrypted); **Import References** brings in peer references from another instance.

### API access

**API** issues long-lived keys and documents the endpoints, so other systems can
read the radar programmatically.
