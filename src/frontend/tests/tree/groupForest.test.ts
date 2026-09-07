import { describe, expect, it } from "vitest";
import {
  buildGroupForest,
  classifyNode,
  pruneForest,
  walkForest,
} from "../../src/tree/groupForest";
import type { GroupNode } from "../../src/tree/groupForest";
import type { RadarEntry } from "../../src/radar/types";
import type { GroupTreeNode } from "../../src/manage/types";

function entry(topicId: string, over: Partial<RadarEntry> = {}): RadarEntry {
  return {
    id: `e-${topicId}`,
    topic_id: topicId,
    technology_id: `t-${topicId}`,
    canonical_name: topicId,
    slug: topicId,
    registry_status: "On Radar",
    segment_id: "seg-1",
    segment_name: "Data & AI",
    ring: "Invest",
    summary: "",
    trl: 5,
    strategic_relevance: "High",
    time_to_mainstream: "0-2 yr",
    movement: "unchanged",
    peer_reference_count: 0,
    peer_references: [],
    persons: [],
    ancestor_path: [],
    ...over,
  } as unknown as RadarEntry;
}

function node(
  topicId: string,
  children: GroupTreeNode[] = [],
  over: Partial<GroupTreeNode> = {},
): GroupTreeNode {
  return {
    topic_id: topicId,
    canonical_name: topicId,
    slug: topicId,
    not_for_external_publication: false,
    on_radar: true,
    children,
    ...over,
  };
}

describe("classifyNode", () => {
  it("calls a topic without a technology a label group", () => {
    expect(classifyNode(false, true)).toBe("labelGroup");
    expect(classifyNode(false, false)).toBe("labelGroup");
  });

  it("distinguishes a parent technology from a leaf technology", () => {
    expect(classifyNode(true, true)).toBe("technologyGroup");
    expect(classifyNode(true, false)).toBe("technology");
  });
});

describe("buildGroupForest", () => {
  it("classifies the three node kinds from one forest", () => {
    const tree = [node("umbrella", [node("parent-tech", [node("leaf")])])];
    const forest = buildGroupForest(tree, [
      entry("parent-tech"),
      entry("leaf"),
    ]);

    const byId = new Map(walkForest(forest).map((n) => [n.topicId, n]));
    expect(byId.get("umbrella")?.kind).toBe("labelGroup");
    expect(byId.get("parent-tech")?.kind).toBe("technologyGroup");
    expect(byId.get("leaf")?.kind).toBe("technology");
  });

  it("leaves a label group with no entry attached", () => {
    const forest = buildGroupForest(
      [node("umbrella", [node("leaf")])],
      [entry("leaf")],
    );
    expect(forest[0]?.entry).toBeNull();
    expect(forest[0]?.children[0]?.entry).not.toBeNull();
  });

  // The groups-tree payload reports on_radar === false for Backlog and Archive
  // technologies exactly as it does for label groups, so classification must
  // come from the snapshot rather than that flag.
  it("does not mistake a Backlog technology for a label group", () => {
    const tree = [
      node("umbrella", [node("shelved", [], { on_radar: false })], {
        on_radar: false,
      }),
    ];
    const forest = buildGroupForest(tree, [
      entry("shelved", { registry_status: "Backlog", ring: null }),
    ]);
    const byId = new Map(walkForest(forest).map((n) => [n.topicId, n]));
    expect(byId.get("shelved")?.kind).toBe("technology");
    expect(byId.get("umbrella")?.kind).toBe("labelGroup");
  });

  it("folds in technologies that belong to no group", () => {
    const forest = buildGroupForest(
      [node("umbrella", [node("inside")])],
      [entry("inside"), entry("standalone")],
    );
    const roots = forest.map((n) => n.topicId);
    expect(roots).toContain("standalone");
    expect(roots).toContain("umbrella");
  });

  it("records depth and sorts roots by name", () => {
    const forest = buildGroupForest(
      [node("zeta", [node("child")])],
      [entry("child"), entry("alpha")],
    );
    expect(forest.map((n) => n.topicId)).toEqual(["alpha", "zeta"]);
    expect(forest[1]?.children[0]?.depth).toBe(1);
  });

  it("returns an empty forest for empty inputs", () => {
    expect(buildGroupForest([], [])).toEqual([]);
  });
});

describe("pruneForest", () => {
  const forest: GroupNode[] = buildGroupForest(
    [node("umbrella", [node("parent-tech", [node("leaf")])])],
    [entry("parent-tech"), entry("leaf")],
  );

  it("keeps ancestors needed to reach a match and flags them", () => {
    const { nodes, connectorOnly } = pruneForest(
      forest,
      (n) => n.topicId === "leaf",
    );
    expect(walkForest(nodes).map((n) => n.topicId)).toEqual([
      "umbrella",
      "parent-tech",
      "leaf",
    ]);
    expect(connectorOnly.has("umbrella")).toBe(true);
    expect(connectorOnly.has("parent-tech")).toBe(true);
    expect(connectorOnly.has("leaf")).toBe(false);
  });

  it("drops a subtree in which nothing matches", () => {
    const { nodes } = pruneForest(forest, () => false);
    expect(nodes).toEqual([]);
  });

  it("keeps everything when the predicate always matches", () => {
    const { nodes, connectorOnly } = pruneForest(forest, () => true);
    expect(walkForest(nodes)).toHaveLength(3);
    expect(connectorOnly.size).toBe(0);
  });
});
