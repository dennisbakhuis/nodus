# Groups

Groups organise technologies into a multi-level taxonomy — for example
_Generative AI ▸ Agentic AI ▸ Multi-Agent Systems_. They are a **metadata layer,
separate from segments**: a group never changes where a dot sits on the radar.
Picking a group in the radar sidebar simply **highlights its members and dims the
rest**, like the search box.

## Two kinds of group node

- **Label groups** — a group with no technology behind it (e.g. an "Artificial
  Intelligence" umbrella). It appears in the tree and breadcrumbs but is never a
  dot on the radar.
- **On-radar groups** — a real technology that _also_ has children. It is both a
  dot **and** a parent; a technology becomes one the moment something is filed
  under it (marked _● on radar_ in the table).

## One parent, always

A technology sits in **exactly one** group. The hierarchy is a strict tree, not
a set of overlapping tags — every node has a single parent, and re-parenting a
node moves it rather than adding it somewhere else.

This is deliberate. A group answers **"what kind of thing is this?"**, and a
thing is one kind of thing. It is also what the radar assumes: a dot occupies
one wedge, so a technology filed in two families would have to be drawn twice or
placed arbitrarily.

### When something seems to belong in two families

It usually means one of three things, and only the last needs a relation:

1. **The two groups are the same idea under different names.** Merge them. Two
   umbrellas that keep competing for the same children are one umbrella.
2. **One of the groups is really a theme, not a family.** "Everything we do for
   the offshore programme" is not a kind of technology. Use a **segment** or a
   **strategic innovation field** for that; both cut across the tree by design.
3. **The membership is genuine but secondary.** File it under its primary
   family, then add a **relation** to the other one.

That third case is what relations are for:

> **Groups say what something _is_. Relations say what something _touches_.**

_Power-to-X-to-Power_ is structurally a Power-to-X variant, so that is its
parent — but it behaves like storage, so it carries a `relates to` link to the
_Energy Storage_ group. A reader browsing storage still finds it; the tree stays
unambiguous. A relation may point at a group node as well as at a technology,
so a whole family is a valid target.

Reach for this sparingly. If more than a handful of technologies need one, the
taxonomy is wrong — go back to points 1 and 2.

## Building the hierarchy

- **Add a group** — give it a name and, optionally, a parent. Leave the parent on
  _Top level_ to create a new root.
- **Add an existing technology to a group** — pick a technology and the parent it
  should sit under. This files something already on the radar into a family.
- **Rename** — click a group's name in the **Hierarchy** table, edit, and press
  Enter. The slug is preserved.
- **Move under…** — use the dropdown on each row to re-parent a node (or send it
  back to the top level). A node's own descendants are hidden, so you can't
  create a loop.

## The group profile

**Profile** on any row opens what the group itself is for. A group is not a
technology, so this is not the technology editor: there is no ring, no TRL and
no assessment, because a family has no maturity of its own.

- **What this family covers** — a sentence or two a newcomer could read to know
  what they are looking at.
- **What belongs here** — the boundary. Saying what _doesn't_ belong is usually
  the more useful half, and it is what stops a taxonomy drifting.
- **People** — who to ask. **Owner**, **Subject Matter Expert** and **Contact**;
  the technology-only roles are not offered. People are saved as you add or
  remove them, not on **Save**.
- **Visibility** — _Not for external publication_ drops the group from the
  public view. Its public children are lifted to the nearest public ancestor
  rather than disappearing with it.

An **on-radar group** has both a profile and a technology factsheet, and they
say different things: the factsheet is about the technology, the profile is
about the family it heads. A row with a profile is marked **✎**.

Readers meet the profile in the **Tree**: clicking a label group opens it, and
a technology group shows it above its factsheet.

## Deleting

Deleting a group **re-parents its children up one level** — nothing is orphaned.
Only label groups can be deleted here; a group that is also **on the radar** must
be archived from its technology card instead.

## Keeping the set small

Groups are navigation, and navigation stops working when there is too much of
it. A few rules that hold up in practice:

- **A group needs at least two children**, and ideally three. A family of one is
  just a technology with an extra click in front of it.
- **A group needs a boundary you can state in a sentence.** If **What belongs
  here** is hard to write, the group is a mood, not a family.
- **Prefer fewer, broader families.** Ten well-drawn groups beat thirty precise
  ones, because a reader can hold ten in their head.
- **Not everything needs a parent.** Leaving a technology ungrouped is a valid
  outcome, and better than inventing an umbrella to hold it.

> The radar sidebar's **Group** filter is where readers browse this hierarchy,
> and the **Tree** view draws it in full. How deep it may nest is set under
> **Manage ▸ Settings ▸ Group hierarchy**.
