import { describe, expect, it } from "vitest";
import {
  buildLineage,
  canonicalEdges,
  degreeByTopic,
  levelBuckets,
} from "../../src/tree/dependencyGraph";
import type { TechnologyRelation } from "../../src/radar/types";

let seq = 0;
function rel(
  from: string,
  to: string,
  relation_type: string,
): TechnologyRelation {
  seq += 1;
  return {
    id: `r${seq}`,
    from_topic_id: from,
    to_topic_id: to,
    relation_type,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const ALL = { includeHinders: true, includeRelates: true };
const DEFAULTS = { includeHinders: true, includeRelates: false };

describe("canonicalEdges", () => {
  it("keeps drives in its stored direction", () => {
    expect(canonicalEdges([rel("a", "b", "drives")])).toEqual([
      { from: "a", to: "b", kind: "drives" },
    ]);
  });

  it("flips driven_by onto the forward form", () => {
    expect(canonicalEdges([rel("a", "b", "driven_by")])).toEqual([
      { from: "b", to: "a", kind: "drives" },
    ]);
  });

  it("flips hindered_by and preserves the hinders kind", () => {
    expect(canonicalEdges([rel("a", "b", "hindered_by")])).toEqual([
      { from: "b", to: "a", kind: "hinders" },
    ]);
  });

  it("collapses the inverse spellings of the same fact into one edge", () => {
    const edges = canonicalEdges([
      rel("a", "b", "drives"),
      rel("b", "a", "driven_by"),
    ]);
    expect(edges).toEqual([{ from: "a", to: "b", kind: "drives" }]);
  });

  it("ignores unknown relation types", () => {
    expect(canonicalEdges([rel("a", "b", "wat")])).toEqual([]);
  });
});

describe("buildLineage", () => {
  it("numbers upstream positive and downstream negative", () => {
    const edges = canonicalEdges([
      rel("up", "anchor", "drives"),
      rel("anchor", "down", "drives"),
    ]);
    const { nodes } = buildLineage("anchor", edges, 3, DEFAULTS);
    expect(nodes.get("anchor")?.level).toBe(0);
    expect(nodes.get("up")?.level).toBe(1);
    expect(nodes.get("down")?.level).toBe(-1);
  });

  it("terminates on a two-node cycle", () => {
    const edges = canonicalEdges([
      rel("a", "b", "drives"),
      rel("b", "a", "drives"),
    ]);
    const { nodes } = buildLineage("a", edges, 5, DEFAULTS);
    expect(nodes.size).toBe(2);
    expect(nodes.get("a")?.level).toBe(0);
  });

  it("keeps the shallowest level when a node is reachable by two paths", () => {
    const edges = canonicalEdges([
      rel("anchor", "mid", "drives"),
      rel("mid", "leaf", "drives"),
      rel("anchor", "leaf", "drives"),
    ]);
    const { nodes } = buildLineage("anchor", edges, 3, DEFAULTS);
    expect(nodes.get("leaf")?.level).toBe(-1);
  });

  it("places a node upstream when a cycle makes it reachable both ways", () => {
    const edges = canonicalEdges([
      rel("other", "anchor", "drives"),
      rel("anchor", "other", "drives"),
    ]);
    const { nodes } = buildLineage("anchor", edges, 3, DEFAULTS);
    expect(nodes.get("other")?.level).toBe(1);
  });

  it("clamps the walk at maxDepth", () => {
    const edges = canonicalEdges([
      rel("anchor", "one", "drives"),
      rel("one", "two", "drives"),
      rel("two", "three", "drives"),
    ]);
    const { nodes } = buildLineage("anchor", edges, 2, DEFAULTS);
    expect(nodes.has("two")).toBe(true);
    expect(nodes.has("three")).toBe(false);
  });

  it("excludes relates_to unless opted in", () => {
    const edges = canonicalEdges([rel("anchor", "side", "relates_to")]);
    expect(buildLineage("anchor", edges, 3, DEFAULTS).nodes.has("side")).toBe(
      false,
    );
    expect(buildLineage("anchor", edges, 3, ALL).nodes.has("side")).toBe(true);
  });

  it("treats relates_to as undirected when included", () => {
    const edges = canonicalEdges([rel("side", "anchor", "relates_to")]);
    const { nodes } = buildLineage("anchor", edges, 3, ALL);
    expect(nodes.has("side")).toBe(true);
  });

  it("can drop hinders edges", () => {
    const edges = canonicalEdges([rel("blocker", "anchor", "hinders")]);
    const off = buildLineage("anchor", edges, 3, {
      includeHinders: false,
      includeRelates: false,
    });
    expect(off.nodes.has("blocker")).toBe(false);
    expect(
      buildLineage("anchor", edges, 3, DEFAULTS).nodes.has("blocker"),
    ).toBe(true);
  });

  it("returns only links whose endpoints both survived", () => {
    const edges = canonicalEdges([
      rel("anchor", "near", "drives"),
      rel("far", "beyond", "drives"),
    ]);
    const { links } = buildLineage("anchor", edges, 1, DEFAULTS);
    expect(links).toEqual([{ from: "anchor", to: "near", kind: "drives" }]);
  });

  it("yields just the anchor when it has no relations", () => {
    const { nodes, links } = buildLineage("lonely", [], 3, DEFAULTS);
    expect([...nodes.keys()]).toEqual(["lonely"]);
    expect(links).toEqual([]);
  });
});

describe("levelBuckets", () => {
  it("orders columns from deepest upstream to deepest downstream", () => {
    const edges = canonicalEdges([
      rel("up", "anchor", "drives"),
      rel("anchor", "down", "drives"),
    ]);
    const { nodes } = buildLineage("anchor", edges, 2, DEFAULTS);
    expect([...levelBuckets(nodes).keys()]).toEqual([1, 0, -1]);
  });
});

describe("degreeByTopic", () => {
  it("counts every endpoint touch", () => {
    const edges = canonicalEdges([
      rel("hub", "a", "drives"),
      rel("hub", "b", "drives"),
    ]);
    expect(degreeByTopic(edges).get("hub")).toBe(2);
    expect(degreeByTopic(edges).get("a")).toBe(1);
  });
});
