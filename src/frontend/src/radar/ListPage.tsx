import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchCurrentRadar, fetchRelations } from "./api";
import { fetchHistoricalRadar } from "../api/radar-snapshot";
import { Sidebar } from "./Sidebar";
import { ListView } from "./ListView";
import { applyListFilters } from "./filtering";
import { ReadOnlyRadarProvider } from "./ReadOnlyRadarContext";
import { useAuth } from "../shared/AuthContext";
import { useRadarCycle } from "../shared/RadarCycleContext";
import { useExportTarget } from "../shared/ExportContext";
import { useAddAction } from "../shared/AddActionContext";
import { EmptyState } from "../shared/EmptyState";
import { LoadingState } from "../shared/LoadingState";
import { TopicDetailModal } from "../topic-detail";
import { AddTopicModal } from "./AddTopicModal";
import type {
  RadarData,
  FilterState,
  RadarEntry,
  MovementStatus,
  RegistryStatusName,
  RingName,
  TechnologyRelation,
} from "./types";

const DEFAULT_LIST_REGISTRY_STATUSES: RegistryStatusName[] = ["On Radar"];
const REGISTRY_STATUS_VALUES: RegistryStatusName[] = [
  "On Radar",
  "Backlog",
  "Archive",
];

function filtersFromParams(
  params: URLSearchParams,
  isWriter: boolean,
): FilterState {
  const segments = params.getAll("segment");
  const rings = params.getAll("ring") as RingName[];
  const movements = params.getAll("movement") as MovementStatus[];
  const search = params.get("search") ?? "";
  const strategicRelevance = params.getAll("sr");
  const minTrlRaw = params.get("min_trl");
  const minTrl = minTrlRaw ? Number(minTrlRaw) : null;
  const rawStatuses = params.getAll("status") as RegistryStatusName[];
  const registryStatuses = rawStatuses.filter((s) =>
    REGISTRY_STATUS_VALUES.includes(s),
  );
  const hasFactsheetParam = params.get("has_factsheet");
  const hasPeerParam = params.get("has_peer_refs");
  const ttmParam = params.getAll("ttm");
  const personIds = params.getAll("person");
  const visParam = params.get("vis");
  return {
    segments,
    rings,
    movements,
    search,
    strategicRelevance,
    minTrl: minTrl != null && Number.isFinite(minTrl) ? minTrl : null,
    registryStatuses:
      registryStatuses.length > 0
        ? registryStatuses
        : DEFAULT_LIST_REGISTRY_STATUSES,
    hasFactsheet:
      hasFactsheetParam === "1"
        ? true
        : hasFactsheetParam === "0"
          ? false
          : null,
    hasPeerRefs:
      hasPeerParam === "1" ? true : hasPeerParam === "0" ? false : null,
    timeToMainstream: ttmParam,
    personIds,
    candidatesOnly: params.get("candidates") === "1",
    visibility:
      visParam === "private"
        ? "private"
        : visParam === "all"
          ? "all"
          : isWriter
            ? "public"
            : "all",
  };
}

function filtersToParams(filters: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  filters.segments.forEach((s) => p.append("segment", s));
  filters.rings.forEach((r) => p.append("ring", r));
  filters.movements.forEach((m) => p.append("movement", m));
  if (filters.search) p.set("search", filters.search);
  filters.strategicRelevance.forEach((s) => p.append("sr", s));
  if (filters.minTrl != null) p.set("min_trl", String(filters.minTrl));
  filters.registryStatuses.forEach((s) => p.append("status", s));
  if (filters.hasFactsheet === true) p.set("has_factsheet", "1");
  if (filters.hasFactsheet === false) p.set("has_factsheet", "0");
  if (filters.hasPeerRefs === true) p.set("has_peer_refs", "1");
  if (filters.hasPeerRefs === false) p.set("has_peer_refs", "0");
  filters.timeToMainstream.forEach((t) => p.append("ttm", t));
  filters.personIds.forEach((id) => p.append("person", id));
  if (filters.candidatesOnly) p.set("candidates", "1");
  if (filters.visibility === "private") p.set("vis", "private");
  else if (filters.visibility === "all") p.set("vis", "all");
  return p;
}

export function ListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setFullBleed } = useRadarCycle();
  const { isWriter } = useAuth();

  useEffect(() => {
    setFullBleed(true);
    return () => setFullBleed(false);
  }, [setFullBleed]);

  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(() =>
    filtersFromParams(searchParams, isWriter),
  );
  const [relations, setRelations] = useState<TechnologyRelation[]>([]);

  const [selectedEntry, setSelectedEntry] = useState<RadarEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const { setTarget: setExportTarget } = useExportTarget();
  const { setTarget: setAddTarget } = useAddAction();
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    const filteredEntries = applyListFilters(data.entries, filters, data);
    const selectedEntries = data.entries.filter((e) => selectedIds.has(e.id));
    setExportTarget({
      mode: "data",
      data,
      filters,
      filteredEntries,
      selectedEntries,
    });
    return () => setExportTarget(null);
  }, [data, filters, selectedIds, setExportTarget]);

  useEffect(() => {
    if (!isWriter || !data) return;
    setAddTarget({ onClick: () => setAddOpen(true) });
    return () => setAddTarget(null);
  }, [isWriter, data, setAddTarget]);

  const historicalCycleId = searchParams.get("cycle");
  const isHistorical = useMemo(() => {
    if (!historicalCycleId || !data?.cycle) return false;
    return data.cycle.id === historicalCycleId && data.cycle.end_date !== null;
  }, [historicalCycleId, data]);

  const reloadRadar = useCallback(() => {
    const loader = historicalCycleId
      ? fetchHistoricalRadar(historicalCycleId)
      : fetchCurrentRadar(
          undefined,
          undefined,
          REGISTRY_STATUS_VALUES,
          isWriter,
        );
    loader
      .then((d) => {
        setData(d);
      })
      .catch(() => undefined);
  }, [isWriter, historicalCycleId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const loader = historicalCycleId
      ? fetchHistoricalRadar(historicalCycleId)
      : fetchCurrentRadar(
          undefined,
          undefined,
          REGISTRY_STATUS_VALUES,
          isWriter,
        );
    loader
      .then((d) => {
        setData(d);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load radar data"),
      )
      .finally(() => setLoading(false));
  }, [isWriter, historicalCycleId]);

  useEffect(() => {
    if (!data) return;
    fetchRelations()
      .then(setRelations)
      .catch(() => setRelations([]));
  }, [data]);

  useEffect(() => {
    const next = filtersToParams(filters);
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const handleRowClick = useCallback((entry: RadarEntry) => {
    setSelectedEntry(entry);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setSelectedEntry(null);
  }, []);

  if (loading) {
    return <LoadingState block>Loading radar data…</LoadingState>;
  }

  if (error || !data) {
    return (
      <EmptyState>
        {error ??
          "No radar data available. Create a cycle and add On Radar technologies to get started."}
      </EmptyState>
    );
  }

  if (data.segments.length === 0) {
    return (
      <EmptyState>
        No segments configured yet. Add one or more segments from the Manage
        page to start building your radar.
      </EmptyState>
    );
  }

  if (!data.cycle) {
    return (
      <EmptyState>
        No active cycle. Create one in Manage → Cycles to start tracking
        technologies on the radar.
      </EmptyState>
    );
  }

  return (
    <ReadOnlyRadarProvider readOnly={isHistorical}>
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
          variant="list"
          entries={data.entries}
          onSegmentsChanged={reloadRadar}
          search={filters.search}
          onSearchChange={(s) => setFilters((f) => ({ ...f, search: s }))}
          onSearchSelect={(entry) => {
            setFilters((f) => ({ ...f, search: entry.canonical_name }));
            handleRowClick(entry);
          }}
          data={data}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
            position: "relative",
          }}
        >
          <ListView
            data={data}
            filters={filters}
            onRowClick={handleRowClick}
            showVisibility={isWriter}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        </div>

        <TopicDetailModal
          slug={selectedEntry?.slug ?? null}
          open={modalOpen && !!selectedEntry}
          onClose={handleModalClose}
          onAfterSave={reloadRadar}
          radarContext={
            selectedEntry
              ? {
                  entry: selectedEntry,
                  data,
                  relations,
                  onNavigate: handleRowClick,
                }
              : undefined
          }
        />

        <AddTopicModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            reloadRadar();
          }}
          onPickExisting={(slug) => {
            setAddOpen(false);
            const existing = data.entries.find((e) => e.slug === slug);
            if (existing) {
              setSelectedEntry(existing);
              setModalOpen(true);
            }
          }}
          segments={data.segments}
          rings={data.rings}
        />
      </div>
    </ReadOnlyRadarProvider>
  );
}
