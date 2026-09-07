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

export type GroupNode = {
  topicId: string;
  name: string;
  slug: string;
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
 * Build the complete group forest.
 *
 * `entries` must come from a snapshot requested with every registry status, or
 * Backlog and Archive technologies will be misclassified as label groups.
 * Technologies that belong to no group are appended as roots so the tree shows
 * the whole population rather than only the grouped part of it.
 */
export function buildGroupForest(
  tree: GroupTreeNode[],
  entries: RadarEntry[],
): GroupNode[] {
  const entryByTopic = new Map<string, RadarEntry>();
  for (const entry of entries) entryByTopic.set(entry.topic_id, entry);

  const seen = new Set<string>();

  function build(nodes: GroupTreeNode[], depth: number): GroupNode[] {
    return nodes.map((node) => {
      seen.add(node.topic_id);
      const children = build(node.children ?? [], depth + 1);
      const entry = entryByTopic.get(node.topic_id) ?? null;
      return {
        topicId: node.topic_id,
        name: node.canonical_name,
        slug: node.slug,
        kind: classifyNode(entry !== null, children.length > 0),
        entry,
        children,
        depth,
      };
    });
  }

  const roots = build(tree, 0);

  const ungrouped = entries
    .filter((entry) => !seen.has(entry.topic_id))
    .map<GroupNode>((entry) => ({
      topicId: entry.topic_id,
      name: entry.canonical_name,
      slug: entry.slug,
      kind: "technology",
      entry,
      children: [],
      depth: 0,
    }));

  return [...roots, ...ungrouped].sort((a, b) => a.name.localeCompare(b.name));
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
