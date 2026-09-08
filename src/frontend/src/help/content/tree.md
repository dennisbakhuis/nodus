# Tree view

The tree shows how technologies relate to each other. Nodus records two
different kinds of connection, and the **Hierarchy** switch in the sidebar
chooses which one you are looking at.

## Groups — "is a kind of"

The grouping hierarchy, the same one curated under **Manage ▸ Groups**. Three
kinds of node appear, and each has its own mark:

- **Label group** — a hollow, dashed square. An umbrella with no technology
  behind it, such as _Artificial Intelligence_. It never appears on the radar.
- **Technology group** — a filled dot inside a ring. A real technology that
  _also_ has children, so it is both a dot on the radar and a parent here.
- **Technology** — a plain filled dot. A leaf with nothing filed under it.

![The three kinds of node in the group tree](figure:tree-nodes)

Dot colour follows the segment, exactly as on the radar and in the list; the
ring around a group node is coloured by its level, matching the column headers.

A node with more beneath it than you can see says so: a collapsed label group
carries a **+**, and a collapsed technology group's ring is drawn broken.

Every node with something beneath it carries a **⊖ / ⊕** control just to its
left: that folds and unfolds the branch, and it is the only thing on a node
that does. Clicking the node itself always opens what the node _is_.

### The group profile

A family is more than a fork in the tree. Clicking a **label group** opens its
profile — what the family covers, what belongs in it, who to ask, and how many
technologies sit beneath it — with **Fold branch** and **Focus on this** at the
foot of the panel. Clicking a **technology group** opens the usual detail
panel with the same profile above the factsheet: the factsheet is about the
technology, the profile is about the family it heads.

Profiles are written under **Manage ▸ Groups ▸ Profile**. A family with none
says so rather than showing an empty panel.

### Choosing how much to show

- **Layout** switches between **Columns** — generations left to right, one
  lane each — and **Radial**, where depth becomes distance from the centre.
  The two show the same tree; radial suits a wide, shallow forest, columns a
  deep one.
- **Levels** opens the tree to a given number of generations. Slide it to the
  top for all of them.
- **Focus** narrows the canvas to one part of the tree. Press **Focus on a
  node…** in the sidebar and click the node you want; **Alt-click** (**⌥-click**
  on a Mac) and **press and hold** do the same without arming anything first.
  Then choose what counts as "its part": **Subtree** (the node and everything
  under it), **Siblings** (the row it sits in, peers included — _Generative AI_
  alongside _Federated Learning_), or **Lineage** (its path from the root, plus
  its subtree). Clear it from the sidebar.
- **Ungrouped** decides where technologies belonging to no group go. Roughly
  half a registry can be ungrouped, and drawn as roots they crowd out the real
  ones — so by default they sit in a tray at the foot of the canvas, one click
  from view. Switch to **As roots** to fold them back into the tree.

Selecting a node dims everything that is not it or a direct neighbour, so a
branch stands out without losing its context.

### Moving around the canvas

Drag to pan and scroll to zoom. The sidebar's zoom row does the same from the
keyboard: **−** and **+** step, the box takes a percentage, and **⌂** re-frames
the whole tree — worth reaching for after changing levels or focus.

Nodes are ordinary controls, so **Tab** reaches them, **Enter** opens the one
you are on, and **Alt-Enter** (**⌥-Enter** on a Mac) focuses on it. With
**Focus on a node…** armed, plain **Enter** focuses too.

## Dependencies — "influences"

The relation graph: `drives`, `hinders` and `relates to`. Pick an **anchor**
technology and the tree traces its lineage outwards from it.

- **Upstream** (`LEVEL +1`, `+2`, …) fans out to the **left** — what the anchor
  depends on, its prerequisites.
- **Downstream** (`LEVEL -1`, `-2`, …) fans out to the **right** — what depends
  on the anchor, what it contributes to.
- **Depth** controls how many steps are traced in each direction.

Solid blue links are `drives`; dashed red links are `hinders`. A faint dotted
link is a _back edge_ — a connection that skips a level or closes a loop,
because technologies can genuinely depend on each other in a cycle.

Only back edges carry an arrowhead. Every other link steps exactly one level in
the direction the columns already read, so an arrow on it would repeat what the
layout says; a back edge is the only one whose direction is not obvious.

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

## Exporting

**Export** in the header saves the canvas as **SVG** (vector, for editing),
**PNG** (bitmap at 2× for slides and documents) or **PDF** (vector, with text
that stays selectable). The file is always the whole tree, framed and at full
strength — panning, zooming or selecting a node does not change what comes out.

> The view is shareable: mode, layout, levels, focus, anchor, depth and every
> filter live in the URL, so a copied link reopens exactly what you were
> looking at.
