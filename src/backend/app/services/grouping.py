"""Pure helpers for the Topic grouping hierarchy (adjacency list on ``Topic``).

The grouping tree is an adjacency list: each Topic optionally points at a
``parent_topic_id``. These helpers operate on an in-memory parent/children map
built once per request so callers avoid per-node queries when walking the tree.
"""

import uuid

from sqlmodel import Session, select

from app.models.topic import Topic

MAX_GROUP_DEPTH = 5


def build_parent_map(session: Session) -> dict[uuid.UUID, uuid.UUID | None]:
    """Return ``{topic_id: parent_topic_id}`` for every Topic."""
    rows = session.exec(select(Topic.id, Topic.parent_topic_id)).all()
    return {tid: pid for tid, pid in rows}


def build_children_map(session: Session) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Return ``{parent_topic_id: [child_topic_id, ...]}`` for every parent."""
    rows = session.exec(select(Topic.id, Topic.parent_topic_id)).all()
    out: dict[uuid.UUID, list[uuid.UUID]] = {}
    for tid, pid in rows:
        if pid is not None:
            out.setdefault(pid, []).append(tid)
    return out


def ancestor_ids(
    parent_map: dict[uuid.UUID, uuid.UUID | None], topic_id: uuid.UUID
) -> list[uuid.UUID]:
    """Ancestor ids from the immediate parent up to the root. Cycle-safe."""
    out: list[uuid.UUID] = []
    seen: set[uuid.UUID] = {topic_id}
    cur = parent_map.get(topic_id)
    while cur is not None and cur not in seen:
        out.append(cur)
        seen.add(cur)
        cur = parent_map.get(cur)
    return out


def ancestor_path(
    parent_map: dict[uuid.UUID, uuid.UUID | None],
    topic_id: uuid.UUID,
    keep: set[uuid.UUID] | None = None,
) -> list[uuid.UUID]:
    """Root-first ancestor ids (``[root, …, immediate_parent]``).

    When ``keep`` is given, ancestors not in the set are dropped — a private
    umbrella above a public child is collapsed out of the chain.
    """
    ids = list(reversed(ancestor_ids(parent_map, topic_id)))
    if keep is not None:
        ids = [i for i in ids if i in keep]
    return ids


def root_group_id(
    parent_map: dict[uuid.UUID, uuid.UUID | None], topic_id: uuid.UUID
) -> uuid.UUID:
    """The top-most ancestor of ``topic_id``, or the topic itself if it has none."""
    ancestors = ancestor_ids(parent_map, topic_id)
    return ancestors[-1] if ancestors else topic_id


def subtree_height(
    children_map: dict[uuid.UUID, list[uuid.UUID]], topic_id: uuid.UUID
) -> int:
    """Number of levels from ``topic_id`` down to its deepest descendant, inclusive."""
    kids = children_map.get(topic_id, [])
    if not kids:
        return 1
    return 1 + max(subtree_height(children_map, k) for k in kids)
