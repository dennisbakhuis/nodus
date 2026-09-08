/**
 * Coordinates and link paths for both tree modes.
 *
 * Groups mode is a genuine tree — one parent per node — so it uses
 * `d3-hierarchy`'s Reingold–Tilford tidy layout, which guarantees non-overlap
 * as subtrees grow at different rates. That guarantee is the first thing
 * hand-rolled indentation loses.
 *
 * Dependency mode is a layered **DAG**, not a tree: a node can have several
 * parents, and same-level and cycle-closing edges exist. `d3.tree()` cannot
 * express that — it requires a single parent and silently drops the rest — so
 * the column arithmetic is done here instead. It is a handful of lines, in the
 * spirit of `radar/geometry.ts`.
 *
 * `d3` is already a dependency of this package and was previously imported
 * nowhere; submodules are imported by name so Vite can tree-shake them.
 */

import { cluster, hierarchy, tree as d3tree } from "d3-hierarchy";
import { linkHorizontal, linkRadial } from "d3-shape";
import type { RadarEntry } from "../radar/types";
import type { GroupNode, TreeNodeKind } from "./groupForest";
import type { CanonicalEdge, EdgeKind, LineageNode } from "./dependencyGraph";
import { depthHeaderLabel, levelHeaderLabel } from "./treeEncodings";

// Labels sit below their node rather than beside it, so rows need room for a
// mark plus a caption. Edges travel horizontally at mark height, which is what
// keeps them from running through the text.
export const ROW_H = 46;
export const COLUMN_W = 230;

/** Gap between concentric depth rings in the radial layout. */
export const RING_STEP = 120;

/** Room reserved outside the outermost ring for radial captions. */
const RADIAL_LABEL_PAD = 170;

export type PositionedNode = {
  topicId: string;
  name: string;
  slug: string;
  kind: TreeNodeKind;
  entry: RadarEntry | null;
  /** Group depth (0-based) or signed dependency level. */
  level: number;
  x: number;
  y: number;
  /** Passes the active filter predicate. */
  matched: boolean;
  /** Retained only to connect a matching descendant — render dimmed. */
  connector: boolean;
  /** Has children the layout left out because the node is not expanded. */
  collapsed: boolean;
  /** Whether it parents anything, open or not. */
  hasChildren: boolean;
  /**
   * Radians clockwise from twelve o'clock, set only by radial layouts. Its
   * presence is what tells the renderer to place the caption along a radius
   * instead of below the mark.
   */
  angle?: number;
};

export type PositionedLink = {
  from: string;
  to: string;
  kind: EdgeKind;
  path: string;
  /** Same-level, level-skipping or cycle-closing — drawn as a dashed arc behind the rest. */
  back: boolean;
  /** Depth of the source node, for tinting a link by the generation it leaves. */
  sourceLevel: number;
  /** A link into a parent carries more weight than one into a leaf. */
  targetKind: TreeNodeKind;
};

export type ColumnHeader = { level: number; x: number; label: string };
export type RingHeader = { level: number; radius: number; label: string };

export type TreeLayout = {
  /** Which ground the renderer draws: vertical lanes, or concentric bands. */
  shape: "columns" | "radial";
  /**
   * `depth` tints a link by the generation it leaves, which is the only signal
   * available when every edge is a `drives` parent link. `relation` keeps the
   * radar's per-category colours, which carry real meaning in dependency mode.
   */
  linkPalette: "depth" | "relation";
  nodes: PositionedNode[];
  links: PositionedLink[];
  /** Populated by columnar layouts; empty for radial. */
  columns: ColumnHeader[];
  /** Populated by the radial layout; empty for columnar. */
  rings: RingHeader[];
  width: number;
  height: number;
};

const link = linkHorizontal<unknown, [number, number]>()
  .x((d) => d[0])
  .y((d) => d[1]);

/** Angle is measured from twelve o'clock, matching `radialPoint` below. */
const radialLink = linkRadial<unknown, [number, number]>()
  .angle((d) => d[0])
  .radius((d) => d[1]);

function radialPoint(angle: number, radius: number): { x: number; y: number } {
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

function pathBetween(sx: number, sy: number, tx: number, ty: number): string {
  return link({ source: [sx, sy], target: [tx, ty] }) ?? "";
}

/** x for a dependency level. Upstream is positive and sits left, so x decreases as level rises. */
export function xForLevel(level: number): number {
  return -level * COLUMN_W;
}

type LayoutInput = {
  matched: Set<string>;
  connector: Set<string>;
};

/**
 * Tidy-tree layout for the group forest.
 *
 * The forest is wrapped in a synthetic root so a single `d3.tree()` pass lays
 * out every root consistently; the synthetic node is dropped afterwards.
 * Children of a collapsed node are omitted entirely rather than positioned and
 * hidden, so the layout closes up around them.
 */
function forestHierarchy(forest: GroupNode[], expanded: Set<string>) {
  return hierarchy<GroupNode>(
    {
      topicId: SYNTHETIC_ROOT,
      name: "",
      slug: "",
      description: null,
      scope: null,
      kind: "labelGroup",
      entry: null,
      children: forest,
      depth: -1,
    },
    (node) =>
      node.topicId === SYNTHETIC_ROOT || expanded.has(node.topicId)
        ? node.children
        : [],
  );
}

const SYNTHETIC_ROOT = "__root__";

/** A node with children the caller chose not to expand still has a subtree. */
function isCollapsed(node: GroupNode, expanded: Set<string>): boolean {
  return node.children.length > 0 && !expanded.has(node.topicId);
}

export function layoutGroupTree(
  forest: GroupNode[],
  expanded: Set<string>,
  { matched, connector }: LayoutInput,
): TreeLayout {
  const root = forestHierarchy(forest, expanded);

  d3tree<GroupNode>().nodeSize([ROW_H, COLUMN_W])(root);

  const nodes: PositionedNode[] = [];
  const byId = new Map<string, PositionedNode>();

  for (const point of root.descendants()) {
    if (point.data.topicId === SYNTHETIC_ROOT) continue;
    // d3 lays trees out top-down; this view is left-to-right, so the axes swap.
    const positioned: PositionedNode = {
      topicId: point.data.topicId,
      name: point.data.name,
      slug: point.data.slug,
      kind: point.data.kind,
      entry: point.data.entry,
      level: point.data.depth,
      x: point.y ?? 0,
      y: point.x ?? 0,
      matched: matched.has(point.data.topicId),
      connector: connector.has(point.data.topicId),
      collapsed: isCollapsed(point.data, expanded),
      hasChildren: point.data.children.length > 0,
    };
    nodes.push(positioned);
    byId.set(positioned.topicId, positioned);
  }

  const links: PositionedLink[] = [];
  for (const point of root.links()) {
    if (point.source.data.topicId === SYNTHETIC_ROOT) continue;
    const source = byId.get(point.source.data.topicId);
    const target = byId.get(point.target.data.topicId);
    if (!source || !target) continue;
    links.push({
      from: source.topicId,
      to: target.topicId,
      kind: "drives",
      path: pathBetween(source.x, source.y, target.x, target.y),
      back: false,
      sourceLevel: source.level,
      targetKind: target.kind,
    });
  }

  // Take each column's x from a node that landed in it rather than recomputing
  // it from the depth: the forest is laid out under a synthetic root, so d3
  // places depth 0 one column in, and deriving the header independently would
  // offset every caption by one column.
  const columns = columnsFrom(nodes, depthHeaderLabel);

  return {
    shape: "columns",
    linkPalette: "depth",
    nodes,
    links,
    columns,
    rings: [],
    ...extent(nodes),
  };
}

/**
 * The same forest drawn as a radial dendrogram.
 *
 * Depth becomes radius and sibling order becomes angle, so a wide generation
 * spends the circumference it needs instead of a tall column. `d3.cluster` is
 * used rather than `d3.tree` deliberately: aligning every leaf on the outermost
 * ring is what makes the ring captions mean anything.
 *
 * Angles run clockwise from twelve o'clock, which is the convention
 * `d3.linkRadial` already assumes, so the link generator needs no adapting.
 */
export function layoutRadialGroups(
  forest: GroupNode[],
  expanded: Set<string>,
  { matched, connector }: LayoutInput,
): TreeLayout {
  const root = forestHierarchy(forest, expanded);

  cluster<GroupNode>()
    .size([2 * Math.PI, 1])
    // Two roots' subtrees need a visible gap between them; siblings do not.
    .separation((a, b) => (a.parent === b.parent ? 1 : 2))(root);

  const nodes: PositionedNode[] = [];
  const byId = new Map<string, PositionedNode>();
  const angleById = new Map<string, number>();
  const radiusById = new Map<string, number>();
  const radiusByLevel = new Map<number, number>();

  for (const point of root.descendants()) {
    if (point.data.topicId === SYNTHETIC_ROOT) continue;
    const angle = point.x ?? 0;
    // The synthetic root occupies depth 0, so a real root sits one ring out.
    const radius = point.depth * RING_STEP;
    const { x, y } = radialPoint(angle, radius);
    const positioned: PositionedNode = {
      topicId: point.data.topicId,
      name: point.data.name,
      slug: point.data.slug,
      kind: point.data.kind,
      entry: point.data.entry,
      level: point.data.depth,
      x,
      y,
      matched: matched.has(point.data.topicId),
      connector: connector.has(point.data.topicId),
      collapsed: isCollapsed(point.data, expanded),
      hasChildren: point.data.children.length > 0,
      angle,
    };
    nodes.push(positioned);
    byId.set(positioned.topicId, positioned);
    angleById.set(positioned.topicId, angle);
    radiusById.set(positioned.topicId, radius);
    // Rings are derived from where nodes actually landed rather than from the
    // group depth: the forest hangs off a synthetic root, so d3 puts depth 0
    // one ring out and a ring computed from the depth alone misses every mark.
    radiusByLevel.set(positioned.level, radius);
  }

  const links: PositionedLink[] = [];
  for (const edge of root.links()) {
    if (edge.source.data.topicId === SYNTHETIC_ROOT) continue;
    const source = byId.get(edge.source.data.topicId);
    const target = byId.get(edge.target.data.topicId);
    if (!source || !target) continue;
    links.push({
      from: source.topicId,
      to: target.topicId,
      kind: "drives",
      path:
        radialLink({
          source: [
            angleById.get(source.topicId) ?? 0,
            radiusById.get(source.topicId) ?? 0,
          ],
          target: [
            angleById.get(target.topicId) ?? 0,
            radiusById.get(target.topicId) ?? 0,
          ],
        }) ?? "",
      back: false,
      sourceLevel: source.level,
      targetKind: target.kind,
    });
  }

  const rings = [...radiusByLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, radius]) => ({
      level,
      radius,
      label: depthHeaderLabel(level),
    }));

  const outer = rings.length ? rings[rings.length - 1]!.radius : 0;
  const span = (outer + RADIAL_LABEL_PAD) * 2;

  return {
    shape: "radial",
    linkPalette: "depth",
    nodes,
    links,
    columns: [],
    rings,
    width: span,
    height: span,
  };
}

/**
 * Layered layout for an anchor-centred lineage.
 *
 * Nodes are bucketed by level into columns, then ordered within a column by the
 * mean position of their already-placed neighbours (a single barycentre sweep
 * outwards from the anchor) so links cross less. Ties fall back to name order,
 * which keeps the layout stable between renders.
 */
export function layoutLineage(
  lineageNodes: Map<string, LineageNode>,
  edges: CanonicalEdge[],
  resolve: (topicId: string) => {
    name: string;
    slug: string;
    kind: TreeNodeKind;
    entry: RadarEntry | null;
  },
  { matched, connector }: LayoutInput,
): TreeLayout {
  const buckets = new Map<number, string[]>();
  for (const node of lineageNodes.values()) {
    if (!buckets.has(node.level)) buckets.set(node.level, []);
    buckets.get(node.level)!.push(node.topicId);
  }

  const neighbours = new Map<string, string[]>();
  const note = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, []);
    neighbours.get(a)!.push(b);
  };
  for (const edge of edges) {
    note(edge.from, edge.to);
    note(edge.to, edge.from);
  }

  const yById = new Map<string, number>();
  // Place the anchor column first, then walk outwards in both directions so
  // each column can be ordered against neighbours that already have a position.
  const levels = [...buckets.keys()].sort(
    (a, b) => Math.abs(a) - Math.abs(b) || b - a,
  );

  for (const level of levels) {
    const ids = [...(buckets.get(level) ?? [])];
    ids.sort((a, b) => {
      const ba = barycentre(a, neighbours, yById);
      const bb = barycentre(b, neighbours, yById);
      if (ba !== bb) return ba - bb;
      return resolve(a).name.localeCompare(resolve(b).name);
    });
    const offset = ((ids.length - 1) * ROW_H) / 2;
    ids.forEach((id, index) => yById.set(id, index * ROW_H - offset));
    buckets.set(level, ids);
  }

  const nodes: PositionedNode[] = [];
  for (const [level, ids] of buckets) {
    for (const id of ids) {
      const meta = resolve(id);
      nodes.push({
        topicId: id,
        name: meta.name,
        slug: meta.slug,
        kind: meta.kind,
        entry: meta.entry,
        level,
        x: xForLevel(level),
        y: yById.get(id) ?? 0,
        matched: matched.has(id),
        connector: connector.has(id),
        collapsed: false,
        hasChildren: false,
      });
    }
  }

  const byId = new Map(nodes.map((n) => [n.topicId, n]));
  const links: PositionedLink[] = [];
  for (const edge of edges) {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target) continue;
    // Levels decrease along the direction of flow — an upstream node at +2
    // drives one at +1, and the anchor at 0 drives one at -1 — so a forward
    // link always steps down exactly one level. Anything else skips a column,
    // joins siblings, or closes a cycle, and is drawn as a back edge.
    const back = source.level - target.level !== 1;
    links.push({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      path: pathBetween(source.x, source.y, target.x, target.y),
      back,
      sourceLevel: source.level,
      targetKind: target.kind,
    });
  }

  const columns = columnsFrom(nodes, levelHeaderLabel, (a, b) => b - a);

  return {
    shape: "columns",
    linkPalette: "relation",
    nodes,
    links,
    columns,
    rings: [],
    ...extent(nodes),
  };
}

/**
 * One header per occupied level, positioned on the nodes actually placed there.
 */
function columnsFrom(
  nodes: PositionedNode[],
  label: (level: number) => string,
  order: (a: number, b: number) => number = (a, b) => a - b,
): ColumnHeader[] {
  const xByLevel = new Map<number, number>();
  for (const node of nodes) {
    if (!xByLevel.has(node.level)) xByLevel.set(node.level, node.x);
  }
  return [...xByLevel.entries()]
    .sort((a, b) => order(a[0], b[0]))
    .map(([level, x]) => ({ level, x, label: label(level) }));
}

function barycentre(
  id: string,
  neighbours: Map<string, string[]>,
  yById: Map<string, number>,
): number {
  const placed = (neighbours.get(id) ?? [])
    .map((n) => yById.get(n))
    .filter((y): y is number => y !== undefined);
  if (placed.length === 0) return 0;
  return placed.reduce((a, b) => a + b, 0) / placed.length;
}

function extent(nodes: PositionedNode[]): { width: number; height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + COLUMN_W,
    height: Math.max(...ys) - Math.min(...ys) + ROW_H,
  };
}
