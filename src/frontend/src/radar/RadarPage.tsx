import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchCurrentRadar, fetchRelations } from "./api";
import { fetchHistoricalRadar } from "../api/radar-snapshot";
import { getSetting } from "../manage/api";
import { Sidebar } from "./Sidebar";
import { DetailPanel } from "./DetailPanel";
import { RadarView, type RadarViewControls } from "./RadarView";
import { ReadOnlyRadarProvider } from "./ReadOnlyRadarContext";
import { useRadarCycle } from "../shared/RadarCycleContext";
import { useExportTarget } from "../shared/ExportContext";
import { useDemoMode } from "../shared/DemoModeContext";
import { EmptyState } from "../shared/EmptyState";
import { LoadingState } from "../shared/LoadingState";
import { TopicDetailModal } from "../topic-detail";
import { DemoCursor } from "./demo/DemoCursor";
import { useDemoPresentation } from "./demo/useDemoPresentation";
import type {
  ColorMode,
  RadarData,
  FilterState,
  RadarEntry,
  MovementStatus,
  RingName,
  ShapeMode,
  TechnologyRelation,
} from "./types";

function filtersFromParams(params: URLSearchParams): FilterState {
  const segments = params.getAll("segment");
  const rings = params.getAll("ring") as RingName[];
  const movements = params.getAll("movement") as MovementStatus[];
  const search = params.get("search") ?? "";
  return {
    segments,
    rings,
    movements,
    search,
    strategicRelevance: [],
    minTrl: null,
    registryStatuses: ["On Radar"],
    hasFactsheet: null,
    hasPeerRefs: null,
    timeToMainstream: [],
    personIds: [],
    candidatesOnly: false,
    visibility: "all",
  };
}

function filtersToParams(filters: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  filters.segments.forEach((s) => p.append("segment", s));
  filters.rings.forEach((r) => p.append("ring", r));
  filters.movements.forEach((m) => p.append("movement", m));
  if (filters.search) p.set("search", filters.search);
  return p;
}

export function RadarPage() {
  const { slug: urlSlug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setFullBleed } = useRadarCycle();

  useEffect(() => {
    setFullBleed(true);
    return () => setFullBleed(false);
  }, [setFullBleed]);

  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(() =>
    filtersFromParams(searchParams),
  );
  const [relations, setRelations] = useState<TechnologyRelation[]>([]);
  const [relationsLoading, setRelationsLoading] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [translate, setTranslate] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const controlsRef = useRef<RadarViewControls | null>(null);
  const [focusedSegmentIdx, setFocusedSegmentIdx] = useState<number | null>(
    null,
  );
  const [focusModeActive, setFocusModeActive] = useState(false);

  const [selectedEntry, setSelectedEntry] = useState<RadarEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("segment");
  const [shapeMode, setShapeMode] = useState<ShapeMode>("dot");
  const [centerLogoUrl, setCenterLogoUrl] = useState<string>("nodus");
  const [demoEnabled, setDemoEnabled] = useState<boolean>(false);
  const [demoSecondsPerStep, setDemoSecondsPerStep] = useState<number>(10);
  const svgRef = useRef<SVGSVGElement>(null);
  const { setTarget: setExportTarget } = useExportTarget();
  const { setTarget: setDemoTarget } = useDemoMode();

  const historicalCycleId = searchParams.get("cycle");
  const isHistorical = useMemo(() => {
    if (!historicalCycleId || !data?.cycle) return false;
    return data.cycle.id === historicalCycleId && data.cycle.end_date !== null;
  }, [historicalCycleId, data]);

  // Publish the radar SVG + data to the chrome's Export button while this
  // page is mounted; clear it on unmount so the button hides on /manage etc.
  useEffect(() => {
    if (data) setExportTarget({ mode: "radar", svgRef, data });
    return () => setExportTarget(null);
  }, [data, setExportTarget]);

  const reloadRadar = useCallback(() => {
    const loader = historicalCycleId
      ? fetchHistoricalRadar(historicalCycleId)
      : fetchCurrentRadar();
    loader
      .then((d) => {
        setData(d);
      })
      .catch(() => undefined);
  }, [historicalCycleId]);

  useEffect(() => {
    let cancelled = false;
    getSetting("radar.center_logo_url")
      .then((s) => {
        if (!cancelled) setCenterLogoUrl(s.value || "nodus");
      })
      .catch(() => {
        if (!cancelled) setCenterLogoUrl("nodus");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSetting("demo.enabled").catch(() => ({
        key: "demo.enabled",
        value: "false",
      })),
      getSetting("demo.seconds_per_step").catch(() => ({
        key: "demo.seconds_per_step",
        value: "10",
      })),
    ]).then(([on, sec]) => {
      if (cancelled) return;
      setDemoEnabled(on.value === "true");
      const parsed = Number.parseInt(sec.value, 10);
      const clamped = Number.isFinite(parsed)
        ? Math.min(60, Math.max(1, parsed))
        : 10;
      setDemoSecondsPerStep(clamped);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedEntry(null);
    const loader = historicalCycleId
      ? fetchHistoricalRadar(historicalCycleId)
      : fetchCurrentRadar();
    loader
      .then((d) => {
        setData(d);
        if (urlSlug && d) {
          const found = d.entries.find((e) => e.slug === urlSlug);
          if (found) setSelectedEntry(found);
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load radar data"),
      )
      .finally(() => setLoading(false));
  }, [urlSlug, historicalCycleId]);

  useEffect(() => {
    if (!data) return;
    setRelationsLoading(true);
    fetchRelations()
      .then(setRelations)
      .catch(() => setRelations([]))
      .finally(() => setRelationsLoading(false));
  }, [data]);

  useEffect(() => {
    const next = filtersToParams(filters);
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const handleDotClick = useCallback((entry: RadarEntry) => {
    setSelectedEntry(entry);
  }, []);

  const handlePanelClose = useCallback(() => {
    setSelectedEntry(null);
    window.history.replaceState({}, "", "/radar");
  }, []);

  const handleSegmentClick = useCallback((idx: number) => {
    setFocusedSegmentIdx(idx);
    setFocusModeActive(true);
  }, []);

  const handleFocusExit = useCallback(() => {
    setFocusedSegmentIdx(null);
  }, []);

  const handleFocusExitComplete = useCallback(() => {
    setFocusModeActive(false);
  }, []);

  function handleZoomSet(percent: number) {
    if (!fitZoom) return;
    controlsRef.current?.setZoom((percent / 100) * fitZoom);
  }

  function handleZoomReset() {
    controlsRef.current?.reset();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedEntry) return;
      if (focusedSegmentIdx !== null) handleFocusExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleFocusExit, focusedSegmentIdx, selectedEntry]);

  const demo = useDemoPresentation({
    enabled: demoEnabled,
    secondsPerStep: demoSecondsPerStep,
    data,
    filters,
    focusedSegmentIdx,
    selectedEntry,
    modalOpen,
    setSelectedEntry,
    setModalOpen,
  });

  useEffect(() => {
    if (!demoEnabled || !data) {
      setDemoTarget(null);
      return;
    }
    setDemoTarget({
      onClick: demo.toggle,
      running: demo.running,
      dwell: demo.dwell,
    });
    return () => setDemoTarget(null);
  }, [demoEnabled, data, demo.toggle, demo.running, demo.dwell, setDemoTarget]);

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
          showZoom
          zoom={zoom}
          fitZoom={fitZoom}
          onZoomSet={handleZoomSet}
          onZoomReset={handleZoomReset}
          entries={data.entries}
          search={filters.search}
          onSearchChange={(s) => setFilters((f) => ({ ...f, search: s }))}
          onSearchSelect={(entry) => {
            setFilters((f) => ({ ...f, search: entry.canonical_name }));
            setSelectedEntry(entry);
          }}
          data={data}
          filters={filters}
          onFiltersChange={setFilters}
          colorMode={colorMode}
          onColorModeChange={setColorMode}
          shapeMode={shapeMode}
          onShapeModeChange={setShapeMode}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
            position: "relative",
            display: "flex",
          }}
        >
          <RadarView
            data={data}
            relations={relations}
            loading={relationsLoading}
            filters={filters}
            selectedEntry={selectedEntry}
            onEntryClick={handleDotClick}
            zoom={zoom}
            translate={translate}
            onZoomChange={setZoom}
            onTranslateChange={setTranslate}
            controlsRef={controlsRef}
            focusedSegmentIdx={focusedSegmentIdx}
            focusModeActive={focusModeActive}
            onSegmentClick={handleSegmentClick}
            onFocusExitComplete={handleFocusExitComplete}
            svgRef={svgRef}
            onFitZoomChange={setFitZoom}
            centerLogoUrl={centerLogoUrl}
            colorMode={colorMode}
            shapeMode={shapeMode}
            cycleLabel={data.cycle?.name}
            cycleLabelColor={data.cycle?.color ?? undefined}
            onFocusExit={handleFocusExit}
          />
        </div>

        <DetailPanel
          entry={selectedEntry}
          data={data}
          relations={relations}
          onClose={handlePanelClose}
          onNavigate={handleDotClick}
          onExpand={() => setModalOpen(true)}
          disabled={modalOpen}
        />

        <TopicDetailModal
          slug={selectedEntry?.slug ?? null}
          open={modalOpen && !!selectedEntry}
          onClose={() => setModalOpen(false)}
          onAfterSave={reloadRadar}
          radarContext={
            selectedEntry
              ? {
                  entry: selectedEntry,
                  data,
                  relations,
                  onNavigate: handleDotClick,
                }
              : undefined
          }
        />

        <DemoCursor
          x={demo.cursor.x}
          y={demo.cursor.y}
          visible={demo.cursor.visible}
          pulsing={demo.cursor.pulsing}
        />
      </div>
    </ReadOnlyRadarProvider>
  );
}
