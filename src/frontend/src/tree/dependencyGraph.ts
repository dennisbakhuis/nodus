/**
 * Dependency-lineage traversal over the Topic relation graph.
 *
 * Two properties of the stored data drive the design here:
 *
 *   - **Inverse forms are both storable.** `A drives B` and `B driven_by A` are
 *     two distinct rows stating the same fact. Every edge is therefore reduced
 *     to a canonical driver-to-driven direction and de-duplicated, or the same
 *     dependency would be drawn (and counted) twice.
 *   - **Cycles are legal.** The backend blocks only self-loops and duplicate
 *     triples, so `A drives B` and `B drives A` can coexist. Unlike the group
 *     hierarchy — which the router keeps acyclic — every traversal here needs
 *     its own visited set.
 */

import type { TechnologyRelation } from "../radar/types";

export type EdgeKind = "drives" | "hinders" | "relates";

export type CanonicalEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
};

/**
 * Reduce stored relations to unique edges pointing from driver to driven.
 *
 * `driven_by` / `hindered_by` are the inverse spellings of `drives` / `hinders`
 * and are flipped onto the forward form. `relates_to` carries no direction; it
 * is kept as-is under the `relates` kind and is meaningful only as an
 * undirected link.
 */
export function canonicalEdges(
  relations: TechnologyRelation[],
): CanonicalEdge[] {
  const seen = new Set<string>();
  const out: CanonicalEdge[] = [];

  for (const rel of relations) {
    const t = rel.relation_type.toLowerCase().replace(/[_\s]/g, "");
    let edge: CanonicalEdge | null = null;

    if (t === "drives") {
      edge = { from: rel.from_topic_id, to: rel.to_topic_id, kind: "drives" };
    } else if (t === "drivenby") {
      edge = { from: rel.to_topic_id, to: rel.from_topic_id, kind: "drives" };
    } else if (t === "hinders") {
      edge = { from: rel.from_topic_id, to: rel.to_topic_id, kind: "hinders" };
    } else if (t === "hinderedby") {
      edge = { from: rel.to_topic_id, to: rel.from_topic_id, kind: "hinders" };
    } else if (t === "relatesto") {
      edge = { from: rel.from_topic_id, to: rel.to_topic_id, kind: "relates" };
    }

    if (!edge) continue;
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }

  return out;
}

export type LineageNode = {
  topicId: string;
  /** Positive upstream (prerequisites), negative downstream, `0` for the anchor. */
  level: number;
};

export type Lineage = {
  nodes: Map<string, LineageNode>;
  links: CanonicalEdge[];
};

export type LineageOptions = {
  includeHinders: boolean;
  includeRelates: boolean;
};

/**
 * Walk the relation graph outwards from one anchor.
 *
 * Upstream follows edges backwards (what drives this) and is numbered `+1`
 * outwards; downstream follows them forwards (what this drives) and is numbered
 * `-1` outwards, matching the column headers in the view.
 *
 * Breadth-first marking means a node reachable by several paths keeps its
 * shallowest level. A node reachable in both directions — only possible via a
 * cycle through the anchor — is placed upstream; the tie-break is arbitrary but
 * fixed, so the layout stays stable across renders.
 */
export function buildLineage(
  anchorTopicId: string,
  edges: CanonicalEdge[],
  maxDepth: number,
  opts: LineageOptions,
): Lineage {
  const usable = edges.filter((e) => {
    if (e.kind === "hinders") return opts.includeHinders;
    if (e.kind === "relates") return opts.includeRelates;
    return true;
  });

  const forward = new Map<string, CanonicalEdge[]>();
  const backward = new Map<string, CanonicalEdge[]>();
  for (const edge of usable) {
    if (!forward.has(edge.from)) forward.set(edge.from, []);
    forward.get(edge.from)!.push(edge);
    if (!backward.has(edge.to)) backward.set(edge.to, []);
    backward.get(edge.to)!.push(edge);
    if (edge.kind === "relates") {
      if (!forward.has(edge.to)) forward.set(edge.to, []);
      forward.get(edge.to)!.push({ ...edge, from: edge.to, to: edge.from });
      if (!backward.has(edge.from)) backward.set(edge.from, []);
      backward.get(edge.from)!.push({ ...edge, from: edge.to, to: edge.from });
    }
  }

  const nodes = new Map<string, LineageNode>([
    [anchorTopicId, { topicId: anchorTopicId, level: 0 }],
  ]);

  const explore = (
    adjacency: Map<string, CanonicalEdge[]>,
    step: (edge: CanonicalEdge) => string,
    sign: number,
  ) => {
    let frontier = [anchorTopicId];
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        for (const edge of adjacency.get(current) ?? []) {
          const neighbour = step(edge);
          if (nodes.has(neighbour)) continue;
          nodes.set(neighbour, { topicId: neighbour, level: sign * depth });
          next.push(neighbour);
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }
  };

  explore(backward, (e) => e.from, 1);
  explore(forward, (e) => e.to, -1);

  const links = usable.filter((e) => nodes.has(e.from) && nodes.has(e.to));

  return { nodes, links };
}

/** Node ids grouped by level, ordered from the deepest upstream to the deepest downstream. */
export function levelBuckets(
  nodes: Map<string, LineageNode>,
): Map<number, string[]> {
  const buckets = new Map<number, string[]>();
  for (const node of nodes.values()) {
    if (!buckets.has(node.level)) buckets.set(node.level, []);
    buckets.get(node.level)!.push(node.topicId);
  }
  return new Map([...buckets.entries()].sort((a, b) => b[0] - a[0]));
}

/** Degree of each topic in the canonical edge set — used to suggest a default anchor. */
export function degreeByTopic(edges: CanonicalEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const edge of edges) {
    bump(edge.from);
    bump(edge.to);
  }
  return degree;
}
