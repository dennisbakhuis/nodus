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
  buildGroupForest,
  pruneForest,
  walkForest,
  type GroupNode,
} from "./groupForest";
import { buildLineage, canonicalEdges } from "./dependencyGraph";
import { layoutGroupTree, layoutLineage, type PositionedNode } from "./layout";
import {
  filtersFromParams,
  filtersToParams,
  ALL_REGISTRY_STATUSES,
} from "../radar/filterParams";

export type TreeMode = "groups" | "deps";

const DEPTHS = [1, 2, 3] as const;
export type TreeDepth = (typeof DEPTHS)[number];

function parseDepth(raw: string | null): TreeDepth {
  const n = Number(raw);
  return (DEPTHS as readonly number[]).includes(n) ? (n as TreeDepth) : 2;
}

export function TreePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isWriter } = useAuth();
  const { setFullBleed } = useRadarCycle();

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
  const [depth, setDepth] = useState<TreeDepth>(() =>
    parseDepth(searchParams.get("depth")),
  );
  const [anchorSlug, setAnchorSlug] = useState<string | null>(() =>
    searchParams.get("anchor"),
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<RadarEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const controlsRef = useRef<TreeViewControls | null>(null);
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

  useEffect(() => {
    const next = filtersToParams(filters);
    next.set("mode", mode);
    if (mode === "deps") {
      next.set("depth", String(depth));
      if (anchorSlug) next.set("anchor", anchorSlug);
    }
    setSearchParams(next, { replace: true });
  }, [filters, mode, depth, anchorSlug, setSearchParams]);

  const forest = useMemo(
    () => (data ? buildGroupForest(groupTree, data.entries) : []),
    [groupTree, data],
  );

  // Expand every root once the forest first arrives, so the view opens on
  // something rather than a bare row of collapsed roots.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || forest.length === 0) return;
    seededRef.current = true;
    setExpanded(new Set(forest.map((n) => n.topicId)));
  }, [forest]);

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
    for (const node of walkForest(forest)) map.set(node.topicId, node);
    return map;
  }, [forest]);

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
      return layoutGroupTree(nodes, expanded, {
        matched: matchedIds,
        connector: connectorOnly,
      });
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
    forest,
    expanded,
    matchedIds,
    anchorTopicId,
    relations,
    depth,
    nodeByTopic,
    entryByTopic,
  ]);

  const handleSelect = useCallback(
    (node: PositionedNode) => {
      if (mode === "groups" && node.entry === null) {
        // A label group has no technology behind it; expanding is the only
        // meaningful action, so a click toggles the subtree instead of opening
        // a detail panel full of empty fields.
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(node.topicId)) next.delete(node.topicId);
          else next.add(node.topicId);
          return next;
        });
        return;
      }
      if (node.entry) setSelected(node.entry);
    },
    [mode],
  );

  const handleAnchor = useCallback((node: PositionedNode) => {
    if (!node.slug) return;
    setAnchorSlug(node.slug);
    setMode("deps");
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
            onZoomChange={handleZoom}
            controlsRef={controlsRef}
          />
        ) : (
          <EmptyState>
            Nothing matches the current filters. Reset them in the sidebar to
            see the full tree.
          </EmptyState>
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
