# Radar view

The radar plots each technology as a dot on a half-circle. Its position encodes
two things:

- **Segment** (the slice) — the area of the business the technology belongs to.
- **Ring** (distance from the centre) — how committed the organisation is.

## The four rings

| Ring        | Meaning                                         |
| ----------- | ----------------------------------------------- |
| **Invest**  | Actively adopted; we are scaling it up.         |
| **Pilot**   | Running a meaningful trial; learning fast.      |
| **Explore** | Worth a closer look; small experiments allowed. |
| **Monitor** | On our radar, but no investment yet.            |

## Moving around the radar

- **Click a dot** to open its detail panel on the right.
- **Click a segment** to zoom into it; press **Esc** to zoom back out.
- **Scroll** to zoom and **drag** to pan. The zoom controls at the top of the
  sidebar (**−**, the percentage, **⌂** home, **+**) do the same.
- **Switch cycle** at the top of the sidebar to view a past radar snapshot.

## Colour and shape

By default dots are coloured by segment and drawn as plain dots. Two sidebar
controls change that:

- **Color dots by** — Segment, Ring tier, TRL, Time to mainstream, Strategic
  relevance, or Movement.
- **Shape dots by** — Dot, or Movement (markers showing how a dot has changed).

## Filtering

The **Filters** section narrows what stands out: matching dots stay bright, the
rest dim — nothing moves. The **↺** next to the Filters heading clears
everything at once.

- **Search** — free text over names and peer references.
- **Segment**, **Rings**, **Movement** — multi-select chips.
- **Strategic relevance** — High / Medium / Low.
- **Person** — show technologies linked to chosen people.
- **TRL range** and **Time to mainstream** — two-handle sliders; the selected
  range is shown in the section label.
- **Group** — see below.

## Group filter

If technologies are organised into groups, the **Group** filter shows them as a
collapsible tree. It starts folded; the **1 / 2 / 3** buttons unfold it to that
depth. Selecting a group highlights its members and dims the rest, like search.
When no groups exist the section says so in grey.

## Movements

Filter by **Movement** (New, Promoted, Demoted, Unchanged) to focus on what
changed since the previous cycle. Movement can also drive a dot's colour or shape
(see above).

## Other controls

- **Collapse** the sidebar with the **«** handle on its edge; the **»** tab
  reopens it.
- **Export** (top bar) saves the current radar as **SVG**, **PNG**, or **PDF**.
