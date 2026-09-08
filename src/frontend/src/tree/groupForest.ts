/**
 * Group-hierarchy forest assembly.
 *
 * The grouping hierarchy is an adjacency list on `Topic.parent_topic_id`. The
 * API exposes it as a nested forest via `GET /api/topics/groups-tree`, but that
 * payload is not sufficient on its own for a full tree view:
 *
 *   - It only contains Topics that *participate* in the hierarchy (have a
 *     parent or have children). Standalone technologies are absent and must be
 *     folded back in from the radar snapshot.
 *   - Its `on_radar` flag means `registry_status === "On Radar"`, so it cannot
 *     distinguish a label group (a Topic with no Technology at all) from a
 *     Backlog or Archive technology. Both read `false`.
 *
 * Both gaps are closed here by joining against a radar snapshot fetched with
 * every registry status, where presence in `entries` is the ground truth for
 * "this Topic has a Technology behind it".
 */

import type { RadarEntry } from "../radar/types";
import type { GroupTreeNode } from "../manage/types";

/**
 * What a node in the group tree actually is.
 *
 * - `labelGroup` — a Topic with no Technology. A pure umbrella; never a dot.
 * - `technologyGroup` — a Technology that also has children. Both dot and parent.
 * - `technology` — a Technology with no children.
 */
export type TreeNodeKind = "labelGroup" | "technologyGroup" | "technology";

/**
 * Hard stop for the forest recursion.
 *
 * `MAX_GROUP_DEPTH` on the backend is enforced when a parent is assigned, not
 * as a stored invariant — a restored backup can carry deeper nesting. The cap
 * is well clear of the five levels the API allows and keeps a malformed
 * payload from recursing without bound.
 */
const MAX_RENDERED_DEPTH = 12;

export type GroupNode = {
  topicId: string;
  name: string;
  slug: string;
  /** What the family covers, and what belongs in it. Parents only. */
  description: string | null;
  scope: string | null;
  kind: TreeNodeKind;
  /** The radar entry behind this node, or `null` for a label group. */
  entry: RadarEntry | null;
  children: GroupNode[];
  depth: number;
};

/** Classify a node given whether it has a Technology and whether it has children. */
export function classifyNode(
  hasTechnology: boolean,
  hasChildren: boolean,
): TreeNodeKind {
  if (!hasTechnology) return "labelGroup";
  return hasChildren ? "technologyGroup" : "technology";
}

/**
 * Split the population into the part that forms a hierarchy and the part that
 * does not.
 *
 * A technology belonging to no group has nothing tree-like to show: rendering
 * it as a depth-0 root puts it in the same column as real roots and makes a
 * shallow forest look like a list. Callers decide where the loose ones go —
 * `buildGroupForest` folds them back in, the tree view parks them in a tray.
 *
 * `entries` must come from a snapshot requested with every registry status, or
 * Backlog and Archive technologies will be misclassified as label groups.
 */
export function partitionForest(
  tree: GroupTreeNode[],
  entries: RadarEntry[],
): { grouped: GroupNode[]; ungrouped: GroupNode[] } {
  const entryByTopic = new Map<string, RadarEntry>();
  for (const entry of entries) entryByTopic.set(entry.topic_id, entry);

  const seen = new Set<string>();

  function build(nodes: GroupTreeNode[], depth: number): GroupNode[] {
    if (depth > MAX_RENDERED_DEPTH) return [];
    return nodes.map((node) => {
      seen.add(node.topic_id);
      const children = build(node.children ?? [], depth + 1);
      const entry = entryByTopic.get(node.topic_id) ?? null;
      return {
        topicId: node.topic_id,
        name: node.canonical_name,
        slug: node.slug,
        description: node.group_description ?? null,
        scope: node.group_scope ?? null,
        kind: classifyNode(entry !== null, children.length > 0),
        entry,
        children,
        depth,
      };
    });
  }

  const byName = (a: GroupNode, b: GroupNode) => a.name.localeCompare(b.name);

  const grouped = build(tree, 0).sort(byName);

  const ungrouped = entries
    .filter((entry) => !seen.has(entry.topic_id))
    .map<GroupNode>((entry) => ({
      topicId: entry.topic_id,
      name: entry.canonical_name,
      slug: entry.slug,
      description: null,
      scope: null,
      kind: "technology",
      entry,
      children: [],
      depth: 0,
    }))
    .sort(byName);

  return { grouped, ungrouped };
}

/**
 * The whole population as one forest, loose technologies included as roots.
 *
 * Kept as the default reading of "the group forest"; the tree view asks for
 * `partitionForest` instead so it can hold the loose ones out of the columns.
 */
export function buildGroupForest(
  tree: GroupTreeNode[],
  entries: RadarEntry[],
): GroupNode[] {
  const { grouped, ungrouped } = partitionForest(tree, entries);
  return [...grouped, ...ungrouped].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Depth-first walk yielding every node in the forest. */
export function walkForest(forest: GroupNode[]): GroupNode[] {
  const out: GroupNode[] = [];
  const visit = (node: GroupNode) => {
    out.push(node);
    node.children.forEach(visit);
  };
  forest.forEach(visit);
  return out;
}

/**
 * Prune the forest to nodes that either match `keep` themselves or have a
 * descendant that does.
 *
 * A node retained only to connect a matching descendant is flagged
 * `connectorOnly` so the renderer can dim it — dropping it would orphan the
 * match, and label groups can never match a technology-level filter at all.
 */
export function pruneForest(
  forest: GroupNode[],
  keep: (node: GroupNode) => boolean,
): { nodes: GroupNode[]; connectorOnly: Set<string> } {
  const connectorOnly = new Set<string>();

  function prune(node: GroupNode): GroupNode | null {
    const children = node.children
      .map(prune)
      .filter((c): c is GroupNode => c !== null);
    const self = keep(node);
    if (!self && children.length === 0) return null;
    if (!self) connectorOnly.add(node.topicId);
    return { ...node, children };
  }

  const nodes = forest.map(prune).filter((n): n is GroupNode => n !== null);
  return { nodes, connectorOnly };
}

/**
 * Which slice of the forest a focused node stands for.
 *
 * - `subtree` — the node and everything under it.
 * - `siblings` — the row the node sits in: its parent's children, each with
 *   their own subtree. This is the "show me Generative AI and the things it
 *   sits alongside" reading, and it is the only one that keeps the node's
 *   peers rather than its relatives.
 * - `lineage` — the path from the containing root down to the node, with only
 *   the on-path child kept at each step, plus the node's full subtree.
 */
export type FocusScope = "subtree" | "siblings" | "lineage";

/** Path from a containing root down to `topicId`, or null if it is absent. */
function pathTo(forest: GroupNode[], topicId: string): GroupNode[] | null {
  function walk(node: GroupNode, trail: GroupNode[]): GroupNode[] | null {
    const here = [...trail, node];
    if (node.topicId === topicId) return here;
    for (const child of node.children) {
      const found = walk(child, here);
      if (found) return found;
    }
    return null;
  }
  for (const root of forest) {
    const found = walk(root, []);
    if (found) return found;
  }
  return null;
}

/**
 * Narrow the forest to the slice `topicId` names under `scope`.
 *
 * Returns an empty forest when the id is absent, which is what the caller
 * wants after a filter has pruned the focused branch away entirely.
 */
export function focusForest(
  forest: GroupNode[],
  topicId: string | null,
  scope: FocusScope = "subtree",
): GroupNode[] {
  if (!topicId) return forest;
  const path = pathTo(forest, topicId);
  if (!path) return [];
  const node = path[path.length - 1]!;

  if (scope === "subtree") return [node];

  if (scope === "siblings") {
    const parent = path.length >= 2 ? path[path.length - 2] : null;
    // A root's siblings are the other roots, which is the whole forest.
    return parent ? parent.children : forest;
  }

  // Rebuild the ancestor chain from the node upwards, dropping the branches
  // that lead nowhere near it.
  return [
    path
      .slice(0, -1)
      .reduceRight<GroupNode>(
        (child, ancestor) => ({ ...ancestor, children: [child] }),
        node,
      ),
  ];
}

/** Ids of every node in the forest at or above `depth`, for expand-to-level. */
export function idsToDepth(forest: GroupNode[], maxDepth: number): Set<string> {
  return new Set(
    walkForest(forest)
      .filter((node) => node.depth <= maxDepth)
      .map((node) => node.topicId),
  );
}
