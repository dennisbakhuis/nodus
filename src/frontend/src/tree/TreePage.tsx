/**
 * The tree view route.
 *
 * Follows the page shape established by `radar/ListPage.tsx`: filter state is
 * seeded from the URL and mirrored back to it, radar and relation data are
 * fetched side by side, and selection opens the shared detail panel.
 *
 * The snapshot is deliberately requested with **every** registry status. Node
 * classification treats "absent from entries" as "this topic has no
 * Technology", so fetching only On Radar would turn every Backlog or Archive
 * technology into a label group. `filters.registryStatuses` still defaults to
 * On Radar, so those nodes are present in the structure but dimmed until the
 * reader opts into them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchCurrentRadar } from "../api/radar-snapshot";
import { fetchRelations } from "../api/relations";
import { listGroupsTree } from "../api/topics";
import { DetailPanel } from "../radar/DetailPanel";
import { Sidebar } from "../radar/Sidebar";
import { applyListFilters } from "../radar/filtering";
import { EmptyState } from "../shared/EmptyState";
import { LoadingState } from "../shared/LoadingState";
import { useRadarCycle } from "../shared/RadarCycleContext";
import { useExportTarget } from "../shared/ExportContext";
import { useAuth } from "../shared/AuthContext";
import { TopicDetailModal } from "../topic-detail";
import type { GroupTreeNode } from "../manage/types";
import type {
  FilterState,
  RadarData,
  RadarEntry,
  TechnologyRelation,
} from "../radar/types";
import { TreeView } from "./TreeView";
import type { TreeViewControls } from "./usePanZoom";
import {
  focusForest,
  idsToDepth,
  partitionForest,
  pruneForest,
  walkForest,
  type FocusScope,
  type GroupNode,
} from "./groupForest";
import { GroupPanel, GroupProfileSection } from "./GroupProfile";
import { UngroupedTray } from "./UngroupedTray";
import { buildLineage, canonicalEdges } from "./dependencyGraph";
import {
  layoutGroupTree,
  layoutLineage,
  layoutRadialGroups,
  type PositionedNode,
} from "./layout";
import {
  filtersFromParams,
  filtersToParams,
  ALL_REGISTRY_STATUSES,
} from "../radar/filterParams";

export type TreeMode = "groups" | "deps";
export type TreeShape = "columns" | "radial";

const DEPTHS = [1, 2, 3] as const;
export type TreeDepth = (typeof DEPTHS)[number];

/** How many generations of the group tree to open. */
export type TreeLevels = number | "all";

function parseDepth(raw: string | null): TreeDepth {
  const n = Number(raw);
  return (DEPTHS as readonly number[]).includes(n) ? (n as TreeDepth) : 2;
}

function parseFocusScope(raw: string | null): FocusScope {
  return raw === "siblings" || raw === "lineage" ? raw : "subtree";
}

function parseLevels(raw: string | null): TreeLevels {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : "all";
}

export function TreePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isWriter } = useAuth();
  const { setFullBleed } = useRadarCycle();
  const { setTarget: setExportTarget } = useExportTarget();

  useEffect(() => {
    setFullBleed(true);
    return () => setFullBleed(false);
  }, [setFullBleed]);

  const [data, setData] = useState<RadarData | null>(null);
  const [groupTree, setGroupTree] = useState<GroupTreeNode[]>([]);
  const [relations, setRelations] = useState<TechnologyRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(() =>
    filtersFromParams(searchParams, isWriter),
  );
  const [mode, setMode] = useState<TreeMode>(() =>
    searchParams.get("mode") === "deps" ? "deps" : "groups",
  );
  const [shape, setShape] = useState<TreeShape>(() =>
    searchParams.get("layout") === "radial" ? "radial" : "columns",
  );
  // Loose technologies are held out of the hierarchy by default and shown in
  // the tray instead; this folds them back in as roots for anyone who wants
  // the whole population in one picture.
  const [ungroupedInTree, setUngroupedInTree] = useState(
    () => searchParams.get("ungrouped") === "1",
  );
  const [levels, setLevels] = useState<TreeLevels>(() =>
    parseLevels(searchParams.get("levels")),
  );
  const [focusSlug, setFocusSlug] = useState<string | null>(() =>
    searchParams.get("focus"),
  );
  const [focusScope, setFocusScope] = useState<FocusScope>(() =>
    parseFocusScope(searchParams.get("scope")),
  );
  const [depth, setDepth] = useState<TreeDepth>(() =>
    parseDepth(searchParams.get("depth")),
  );
  const [anchorSlug, setAnchorSlug] = useState<string | null>(() =>
    searchParams.get("anchor"),
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Armed from the sidebar: the next click on the canvas picks a focus target
  // rather than opening a detail panel.
  const [pickingFocus, setPickingFocus] = useState(false);
  // The label group whose profile is open. A technology group's profile rides
  // along in the shared detail panel instead, because it already opens one.
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RadarEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const controlsRef = useRef<TreeViewControls | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCurrentRadar(undefined, undefined, [...ALL_REGISTRY_STATUSES]),
      listGroupsTree().catch(() => [] as GroupTreeNode[]),
      fetchRelations().catch(() => [] as TechnologyRelation[]),
    ])
      .then(([snapshot, tree, edges]) => {
        setData(snapshot);
        setGroupTree(tree);
        setRelations(edges);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load radar data"),
      )
      .finally(() => setLoading(false));
  }, []);

  // Publish the canvas to the chrome's Export button while this page is
  // mounted, and clear it on unmount so the button hides elsewhere.
  useEffect(() => {
    if (!data) return;
    setExportTarget({
      mode: "tree",
      svgRef,
      data,
      fileBase: `nodus-tree-${mode}-${shape}`,
    });
    return () => setExportTarget(null);
  }, [data, mode, shape, setExportTarget]);

  useEffect(() => {
    const next = filtersToParams(filters);
    next.set("mode", mode);
    if (mode === "groups") {
      if (shape === "radial") next.set("layout", shape);
      if (ungroupedInTree) next.set("ungrouped", "1");
      if (levels !== "all") next.set("levels", String(levels));
      if (focusSlug) {
        next.set("focus", focusSlug);
        if (focusScope !== "subtree") next.set("scope", focusScope);
      }
    }
    if (mode === "deps") {
      next.set("depth", String(depth));
      if (anchorSlug) next.set("anchor", anchorSlug);
    }
    setSearchParams(next, { replace: true });
  }, [
    filters,
    mode,
    shape,
    ungroupedInTree,
    levels,
    focusSlug,
    focusScope,
    depth,
    anchorSlug,
    setSearchParams,
  ]);

  const { grouped, ungrouped } = useMemo(
    () =>
      data
        ? partitionForest(groupTree, data.entries)
        : { grouped: [] as GroupNode[], ungrouped: [] as GroupNode[] },
    [groupTree, data],
  );

  // Holding the loose ones back only makes sense when there is a hierarchy to
  // hold them back from. With no groups at all, the tray would be the entire
  // population and the canvas would be blank.
  const ungroupedAsRoots = ungroupedInTree || grouped.length === 0;

  const baseForest = useMemo(
    () =>
      ungroupedAsRoots
        ? [...grouped, ...ungrouped].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
        : grouped,
    [grouped, ungrouped, ungroupedAsRoots],
  );

  const focusTopicId = useMemo(() => {
    if (!focusSlug) return null;
    return (
      walkForest(baseForest).find(
        (n) => n.slug === focusSlug || n.topicId === focusSlug,
      )?.topicId ?? null
    );
  }, [baseForest, focusSlug]);

  const forest = useMemo(
    () => focusForest(baseForest, focusTopicId, focusScope),
    [baseForest, focusTopicId, focusScope],
  );

  // One button per generation the data actually has, minus the deepest — that
  // one is what "All" already means. A hard-coded ceiling would either hide
  // levels a five-deep forest has or offer levels a two-deep one does not.
  const maxLevels = useMemo(
    () =>
      walkForest(baseForest).reduce(
        (max, node) => Math.max(max, node.depth),
        0,
      ) + 1,
    [baseForest],
  );

  const applyLevels = useCallback(
    (next: TreeLevels) => {
      setLevels(next);
      // Opening N generations means expanding everything shallower than the
      // last one: a node is expanded to reveal its children, not itself.
      setExpanded(
        next === "all"
          ? new Set(walkForest(baseForest).map((n) => n.topicId))
          : idsToDepth(baseForest, next - 2),
      );
    },
    [baseForest],
  );

  // Open the forest to the requested depth once it first arrives. Seeding only
  // the roots hid every generation below the second — the structure is several
  // levels deep and the view opened looking flat.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || baseForest.length === 0) return;
    seededRef.current = true;
    applyLevels(levels);
  }, [baseForest, levels, applyLevels]);

  const matchedIds = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      applyListFilters(data.entries, filters, data).map((e) => e.topic_id),
    );
  }, [data, filters]);

  const entryByTopic = useMemo(() => {
    const map = new Map<string, RadarEntry>();
    for (const e of data?.entries ?? []) map.set(e.topic_id, e);
    return map;
  }, [data]);

  const nodeByTopic = useMemo(() => {
    const map = new Map<string, GroupNode>();
    for (const node of walkForest([...grouped, ...ungrouped]))
      map.set(node.topicId, node);
    return map;
  }, [grouped, ungrouped]);

  /** Technologies anywhere beneath a node — what "members" means to a reader. */
  const memberCount = useCallback(
    (topicId: string) => {
      const node = nodeByTopic.get(topicId);
      if (!node) return 0;
      return walkForest(node.children).filter((n) => n.entry !== null).length;
    },
    [nodeByTopic],
  );

  const openGroup = openGroupId ? (nodeByTopic.get(openGroupId) ?? null) : null;
  // A selected technology that also heads a family: its factsheet is about the
  // technology, so the family's profile is appended rather than merged.
  const selectedGroup = useMemo(() => {
    if (!selected) return null;
    const node = nodeByTopic.get(selected.topic_id);
    return node && node.children.length > 0 ? node : null;
  }, [selected, nodeByTopic]);

  const anchorTopicId = useMemo(() => {
    if (!anchorSlug) return null;
    return (
      data?.entries.find((e) => e.slug === anchorSlug)?.topic_id ??
      [...nodeByTopic.values()].find((n) => n.slug === anchorSlug)?.topicId ??
      null
    );
  }, [anchorSlug, data, nodeByTopic]);

  const layout = useMemo(() => {
    if (!data) return null;
    if (mode === "groups") {
      const { nodes, connectorOnly } = pruneForest(forest, (node) =>
        matchedIds.has(node.topicId),
      );
      const input = { matched: matchedIds, connector: connectorOnly };
      return shape === "radial"
        ? layoutRadialGroups(nodes, expanded, input)
        : layoutGroupTree(nodes, expanded, input);
    }
    if (!anchorTopicId) return null;
    const edges = canonicalEdges(relations);
    const lineage = buildLineage(anchorTopicId, edges, depth, {
      includeHinders: true,
      includeRelates: false,
    });
    return layoutLineage(
      lineage.nodes,
      lineage.links,
      (topicId) => {
        const node = nodeByTopic.get(topicId);
        const entry = entryByTopic.get(topicId) ?? null;
        return {
          name: node?.name ?? entry?.canonical_name ?? "Unknown topic",
          slug: node?.slug ?? entry?.slug ?? "",
          kind: node?.kind ?? (entry ? "technology" : "labelGroup"),
          entry,
        };
      },
      { matched: matchedIds, connector: new Set<string>() },
    );
  }, [
    data,
    mode,
    shape,
    forest,
    expanded,
    matchedIds,
    anchorTopicId,
    relations,
    depth,
    nodeByTopic,
    entryByTopic,
  ]);

  const toggleBranch = useCallback((node: PositionedNode) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.topicId)) next.delete(node.topicId);
      else next.add(node.topicId);
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (node: PositionedNode) => {
      if (mode === "groups" && node.entry === null) {
        // A label group has no technology behind it, but it does have a
        // profile — a remit, a boundary, an owner — and until now there was
        // nowhere to read it. Folding moved to the node's own disclosure
        // control so this click can open that profile.
        setOpenGroupId(node.topicId);
        return;
      }
      if (node.entry) {
        // Two panels over one canvas is one too many.
        setOpenGroupId(null);
        setSelected(node.entry);
      }
    },
    [mode],
  );

  const handleAnchor = useCallback((node: PositionedNode) => {
    if (!node.slug) return;
    setAnchorSlug(node.slug);
    setMode("deps");
  }, []);

  useEffect(() => {
    if (mode !== "groups") {
      setPickingFocus(false);
      setOpenGroupId(null);
    }
  }, [mode]);

  const handleFocus = useCallback((node: PositionedNode) => {
    // Key on the slug where there is one so the URL stays readable, but never
    // refuse to focus for want of it: a label group's slug comes from the
    // groups-tree payload, and silently doing nothing is indistinguishable
    // from a broken control.
    setFocusSlug(node.slug || node.topicId);
    // A scope carried over from a previously focused node is not what the
    // reader asked for, and one combination is actively misleading: "siblings"
    // on a root returns every root, so picking a top-level umbrella appears to
    // do nothing at all. A new target starts from its own subtree.
    setFocusScope("subtree");
    // Focusing a node the reader had collapsed would show a single mark and
    // nothing else, which reads as a bug rather than as a subtree.
    setExpanded((prev) => new Set(prev).add(node.topicId));
  }, []);

  const handleZoom = useCallback((next: number, fit: number) => {
    setZoom(next);
    setFitZoom(fit);
  }, []);

  if (loading)
    return <LoadingState block>Loading technology tree…</LoadingState>;

  if (error || !data) {
    return (
      <EmptyState>
        {error ??
          "No radar data available. Create a cycle and add technologies to get started."}
      </EmptyState>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        height: "100%",
        overflow: "hidden",
        background: "var(--color-page-background)",
        fontFamily: "var(--font-family)",
      }}
    >
      <Sidebar
        variant="tree"
        entries={data.entries}
        data={data}
        filters={filters}
        onFiltersChange={setFilters}
        search={filters.search}
        onSearchChange={(s) => setFilters((f) => ({ ...f, search: s }))}
        onSearchSelect={(entry) => {
          if (mode === "deps") setAnchorSlug(entry.slug);
          else setSelected(entry);
        }}
        showZoom
        zoom={zoom}
        fitZoom={fitZoom}
        onZoomSet={(percent) =>
          controlsRef.current?.setZoom((percent / 100) * fitZoom)
        }
        onZoomReset={() => controlsRef.current?.reset()}
        treeMode={mode}
        onTreeModeChange={setMode}
        treeShape={shape}
        onTreeShapeChange={setShape}
        ungroupedInTree={ungroupedInTree}
        onUngroupedInTreeChange={setUngroupedInTree}
        ungroupedCount={grouped.length === 0 ? 0 : ungrouped.length}
        treeLevels={levels}
        onTreeLevelsChange={applyLevels}
        treeMaxLevels={maxLevels}
        focusName={
          focusTopicId ? (nodeByTopic.get(focusTopicId)?.name ?? null) : null
        }
        onFocusClear={() => {
          setFocusSlug(null);
          setPickingFocus(false);
        }}
        focusPicking={pickingFocus}
        onFocusPickingChange={setPickingFocus}
        focusScope={focusScope}
        onFocusScopeChange={setFocusScope}
        treeDepth={depth}
        onTreeDepthChange={setDepth}
        anchorName={
          anchorTopicId
            ? (nodeByTopic.get(anchorTopicId)?.name ??
              entryByTopic.get(anchorTopicId)?.canonical_name ??
              null)
            : null
        }
        onAnchorClear={() => setAnchorSlug(null)}
      />

      <div
        style={{ flex: 1, minWidth: 0, display: "flex", position: "relative" }}
      >
        {mode === "deps" && !anchorTopicId ? (
          <EmptyState>
            Pick an anchor technology to trace its dependencies — search for one
            in the sidebar, or double-click a node in the Groups view.
          </EmptyState>
        ) : layout && layout.nodes.length > 0 ? (
          <TreeView
            layout={layout}
            data={data}
            selectedTopicId={selected?.topic_id ?? null}
            anchorTopicId={anchorTopicId}
            onSelect={handleSelect}
            onAnchor={handleAnchor}
            onFocus={handleFocus}
            onToggleBranch={toggleBranch}
            picking={pickingFocus}
            onPickingChange={setPickingFocus}
            onZoomChange={handleZoom}
            controlsRef={controlsRef}
            svgRef={svgRef}
          />
        ) : (
          <EmptyState>
            Nothing matches the current filters. Reset them in the sidebar to
            see the full tree.
          </EmptyState>
        )}

        {openGroup && (
          <GroupPanel
            name={openGroup.name}
            slug={openGroup.slug}
            description={openGroup.description}
            scope={openGroup.scope}
            memberCount={memberCount(openGroup.topicId)}
            collapsed={!expanded.has(openGroup.topicId)}
            onToggleBranch={() =>
              toggleBranch({ topicId: openGroup.topicId } as PositionedNode)
            }
            onFocus={() => {
              setFocusSlug(openGroup.slug || openGroup.topicId);
              setFocusScope("subtree");
              setExpanded((prev) => new Set(prev).add(openGroup.topicId));
              setOpenGroupId(null);
            }}
            onClose={() => setOpenGroupId(null)}
          />
        )}

        {mode === "groups" && !ungroupedAsRoots && (
          <UngroupedTray
            nodes={ungrouped}
            data={data}
            onSelect={(entry) => setSelected(entry)}
          />
        )}
      </div>

      <DetailPanel
        entry={selected}
        data={data}
        relations={relations}
        syncUrl={false}
        onClose={() => setSelected(null)}
        onNavigate={(entry) => setSelected(entry)}
        onExpand={() => setModalOpen(true)}
        disabled={modalOpen}
        extraSection={
          selectedGroup && (
            <GroupProfileSection
              slug={selectedGroup.slug}
              description={selectedGroup.description}
              scope={selectedGroup.scope}
              memberCount={memberCount(selectedGroup.topicId)}
            />
          )
        }
      />

      <TopicDetailModal
        slug={selected?.slug ?? null}
        open={modalOpen && !!selected}
        onClose={() => setModalOpen(false)}
        radarContext={
          selected
            ? {
                entry: selected,
                data,
                relations,
                onNavigate: (entry) => setSelected(entry),
              }
            : undefined
        }
      />
    </div>
  );
}
