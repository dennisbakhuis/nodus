# Tree view

The tree shows how technologies relate to each other. Nodus records two
different kinds of connection, and the **Hierarchy** switch in the sidebar
chooses which one you are looking at.

## Groups — "is a kind of"

The grouping hierarchy, the same one curated under **Manage ▸ Groups**. Three
kinds of node appear, and each has its own mark:

- **Label group** — a hollow, dashed square. An umbrella with no technology
  behind it, such as *Artificial Intelligence*. It never appears on the radar.
  Clicking one folds or unfolds its branch.
- **Technology group** — a filled dot inside a ring. A real technology that
  *also* has children, so it is both a dot on the radar and a parent here.
- **Technology** — a plain filled dot. A leaf with nothing filed under it.

Dot colour follows the segment, exactly as on the radar and in the list.

## Dependencies — "influences"

The relation graph: `drives`, `hinders` and `relates to`. Pick an **anchor**
technology and the tree traces its lineage outwards from it.

- **Upstream** (`LEVEL +1`, `+2`, …) fans out to the **left** — what the anchor
  depends on, its prerequisites.
- **Downstream** (`LEVEL -1`, `-2`, …) fans out to the **right** — what depends
  on the anchor, what it contributes to.
- **Depth** controls how many steps are traced in each direction.

Solid blue links are `drives`; dashed red links are `hinders`. A faint dashed
link with no arrowhead is a *back edge* — a connection that skips a level or
closes a loop, because technologies can genuinely depend on each other in a
cycle.

Set the anchor from the sidebar search, or **double-click** any node to
re-anchor on it. A single click opens the detail panel instead, so you can read
about a technology without losing your place.

## Filtering

The same filters as the list, and they behave slightly differently in each mode:

- In **Groups**, filtering narrows what is highlighted. Branches leading to a
  match are kept but greyed out, so a result is never orphaned from its family.
  Label groups have no ring or TRL of their own, so they survive only when
  something beneath them matches.
- In **Dependencies**, filtering narrows what the lineage may pass through. A
  filtered-out technology's dependencies are not the anchor's dependencies.

Registry Status defaults to **On Radar**. Backlog and Archive technologies are
still part of the structure — switch them on to see them.

> The view is shareable: mode, anchor, depth and every filter live in the URL,
> so a copied link reopens exactly what you were looking at.
