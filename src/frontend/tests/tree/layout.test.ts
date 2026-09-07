import { describe, expect, it } from "vitest";
import {
  COLUMN_W,
  layoutGroupTree,
  layoutLineage,
  xForLevel,
} from "../../src/tree/layout";
import { levelHeaderLabel } from "../../src/tree/treeEncodings";
import { buildGroupForest, walkForest } from "../../src/tree/groupForest";
import { buildLineage, canonicalEdges } from "../../src/tree/dependencyGraph";
import type { GroupTreeNode } from "../../src/manage/types";
import type { RadarEntry } from "../../src/radar/types";
import type { TreeNodeKind } from "../../src/tree/groupForest";

function entry(topicId: string): RadarEntry {
  return {
    id: `e-${topicId}`,
    topic_id: topicId,
    canonical_name: topicId,
    slug: topicId,
    registry_status: "On Radar",
    ancestor_path: [],
  } as unknown as RadarEntry;
}

function node(topicId: string, children: GroupTreeNode[] = []): GroupTreeNode {
  return {
    topic_id: topicId,
    canonical_name: topicId,
    slug: topicId,
    not_for_external_publication: false,
    on_radar: true,
    children,
  };
}

const NO_FILTER = { matched: new Set<string>(), connector: new Set<string>() };

function resolver(kind: TreeNodeKind = "technology") {
  return (topicId: string) => ({
    name: topicId,
    slug: topicId,
    kind,
    entry: entry(topicId),
  });
}

describe("xForLevel", () => {
  it("places upstream to the left of the anchor and downstream to the right", () => {
    expect(xForLevel(1)).toBeLessThan(xForLevel(0));
    expect(xForLevel(0)).toBeLessThan(xForLevel(-1));
  });

  it("spaces columns one column width apart", () => {
    expect(xForLevel(0) - xForLevel(1)).toBe(COLUMN_W);
  });
});

describe("levelHeaderLabel", () => {
  it("captions the anchor and both directions", () => {
    expect(levelHeaderLabel(0)).toBe("ANCHOR");
    expect(levelHeaderLabel(1)).toBe("UPSTREAM · LEVEL +1");
    expect(levelHeaderLabel(-1)).toBe("DOWNSTREAM · LEVEL -1");
  });
});

describe("layoutGroupTree", () => {
  const forest = buildGroupForest(
    [node("umbrella", [node("parent"), node("sibling")])],
    [entry("parent"), entry("sibling")],
  );
  const expanded = new Set(walkForest(forest).map((n) => n.topicId));

  it("places children to the right of their parent", () => {
    const { nodes } = layoutGroupTree(forest, expanded, NO_FILTER);
    const byId = new Map(nodes.map((n) => [n.topicId, n]));
    expect(byId.get("parent")!.x).toBeGreaterThan(byId.get("umbrella")!.x);
  });

  it("gives every node a distinct position", () => {
    const { nodes } = layoutGroupTree(forest, expanded, NO_FILTER);
    const seen = new Set(nodes.map((n) => `${n.x}|${n.y}`));
    expect(seen.size).toBe(nodes.length);
  });

  it("produces finite coordinates", () => {
    const { nodes } = layoutGroupTree(forest, expanded, NO_FILTER);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("omits the children of a collapsed node", () => {
    const { nodes } = layoutGroupTree(forest, new Set(), NO_FILTER);
    expect(nodes.map((n) => n.topicId)).toEqual(["umbrella"]);
  });

  it("drops the synthetic root from the output", () => {
    const { nodes } = layoutGroupTree(forest, expanded, NO_FILTER);
    expect(nodes.some((n) => n.topicId === "__root__")).toBe(false);
  });

  it("emits one column per occupied depth", () => {
    const { columns } = layoutGroupTree(forest, expanded, NO_FILTER);
    expect(columns.map((c) => c.label)).toEqual(["LEVEL 1", "LEVEL 2"]);
  });

  it("handles an empty forest", () => {
    const { nodes, links, width } = layoutGroupTree([], new Set(), NO_FILTER);
    expect(nodes).toEqual([]);
    expect(links).toEqual([]);
    expect(width).toBe(0);
  });
});

describe("layoutLineage", () => {
  const edges = canonicalEdges([
    {
      id: "1",
      from_topic_id: "up",
      to_topic_id: "anchor",
      relation_type: "drives",
      created_at: "",
    },
    {
      id: "2",
      from_topic_id: "anchor",
      to_topic_id: "down",
      relation_type: "drives",
      created_at: "",
    },
  ] as never);

  const lineage = buildLineage("anchor", edges, 2, {
    includeHinders: true,
    includeRelates: false,
  });

  it("orders columns upstream to downstream, left to right", () => {
    const { columns } = layoutLineage(
      lineage.nodes,
      lineage.links,
      resolver(),
      NO_FILTER,
    );
    expect(columns.map((c) => c.label)).toEqual([
      "UPSTREAM · LEVEL +1",
      "ANCHOR",
      "DOWNSTREAM · LEVEL -1",
    ]);
    expect(columns[0]!.x).toBeLessThan(columns[2]!.x);
  });

  it("positions upstream nodes left of the anchor", () => {
    const { nodes } = layoutLineage(
      lineage.nodes,
      lineage.links,
      resolver(),
      NO_FILTER,
    );
    const byId = new Map(nodes.map((n) => [n.topicId, n]));
    expect(byId.get("up")!.x).toBeLessThan(byId.get("anchor")!.x);
    expect(byId.get("down")!.x).toBeGreaterThan(byId.get("anchor")!.x);
  });

  it("emits a non-empty path for every link", () => {
    const { links } = layoutLineage(
      lineage.nodes,
      lineage.links,
      resolver(),
      NO_FILTER,
    );
    expect(links).toHaveLength(2);
    for (const l of links) expect(l.path.length).toBeGreaterThan(0);
  });

  it("flags a cycle-closing edge as a back edge", () => {
    const cyclic = canonicalEdges([
      {
        id: "1",
        from_topic_id: "a",
        to_topic_id: "b",
        relation_type: "drives",
        created_at: "",
      },
      {
        id: "2",
        from_topic_id: "b",
        to_topic_id: "a",
        relation_type: "drives",
        created_at: "",
      },
    ] as never);
    const result = buildLineage("a", cyclic, 2, {
      includeHinders: true,
      includeRelates: false,
    });
    const { links } = layoutLineage(
      result.nodes,
      result.links,
      resolver(),
      NO_FILTER,
    );
    expect(links.some((l) => l.back)).toBe(true);
  });

  it("centres each column vertically around zero", () => {
    const wide = canonicalEdges([
      {
        id: "1",
        from_topic_id: "anchor",
        to_topic_id: "x",
        relation_type: "drives",
        created_at: "",
      },
      {
        id: "2",
        from_topic_id: "anchor",
        to_topic_id: "y",
        relation_type: "drives",
        created_at: "",
      },
    ] as never);
    const result = buildLineage("anchor", wide, 1, {
      includeHinders: true,
      includeRelates: false,
    });
    const { nodes } = layoutLineage(
      result.nodes,
      result.links,
      resolver(),
      NO_FILTER,
    );
    const downstream = nodes.filter((n) => n.level === -1);
    const mean =
      downstream.reduce((sum, n) => sum + n.y, 0) / downstream.length;
    expect(mean).toBeCloseTo(0);
  });

  it("carries the matched and connector flags through", () => {
    const { nodes } = layoutLineage(lineage.nodes, lineage.links, resolver(), {
      matched: new Set(["anchor"]),
      connector: new Set(["up"]),
    });
    const byId = new Map(nodes.map((n) => [n.topicId, n]));
    expect(byId.get("anchor")!.matched).toBe(true);
    expect(byId.get("up")!.connector).toBe(true);
    expect(byId.get("down")!.matched).toBe(false);
  });
});
