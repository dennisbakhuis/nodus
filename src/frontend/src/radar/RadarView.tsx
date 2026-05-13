import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ArcDatum,
  ColorMode,
  FilterState,
  RadarData,
  RadarEntry,
  ShapeMode,
  TechnologyRelation,
} from "./types";
import { themeByKey } from "./segmentThemes";
import {
  CX,
  CY,
  DOT_RADIAL_JITTER,
  FOCUS_INNER_SCALE,
  LABEL_R,
  R_INNER,
  R_OUTER,
  SVG_W,
  VB_H,
  VB_Y,
  WHEEL_ZOOM_FACTOR,
  WHEEL_ZOOM_NORMALIZE,
  ZOOM_MAX,
  ZOOM_MIN,
  applyFocusTransform,
  arcSegmentPath,
  halfArcPath,
  hash01,
  segBandPath,
} from "./geometry";
import {
  MOVEMENT_COLORS,
  NO_VALUE_COLOR,
  RELATION_STROKES,
  RELEVANCE_COLORS,
  RING_DOT_COLORS,
  TRL_COLOR_BY_LEVEL,
  TRL_LEVELS,
  TTM_COLORS,
  trlBucketColor,
  type RelationCategory,
} from "./encodings";
import {
  arrowPolygonPoints,
  renderEntryShape,
  starPolygonPoints,
} from "./shapes";
import { relationCategory, relationStroke } from "./relations";
import { cellMatchesFilter, isVisible } from "./filtering";

// Color encodings, ring/dot palettes, and TRL bucketing live in
// ./encodings.ts. Shape rendering (star/arrow polygons + renderEntryShape)
// lives in ./shapes.tsx. relationCategory + relationStroke live in
// ./relations.ts and cellMatchesFilter + isVisible in ./filtering.ts.
// halfArcPath, hash01, arcSegmentPath, applyFocusTransform, segBandPath, and
// DOT_RADIAL_JITTER live in ./geometry.ts.

export type RadarViewControls = {
  setZoom: (absoluteZoom: number) => void;
  reset: () => void;
};

type Props = {
  data: RadarData;
  relations: TechnologyRelation[];
  loading: boolean;
  filters: FilterState;
  selectedEntry: RadarEntry | null;
  onEntryClick: (entry: RadarEntry) => void;
  zoom: number;
  translate: { x: number; y: number };
  onZoomChange: (z: number) => void;
  onTranslateChange: (t: { x: number; y: number }) => void;
  controlsRef?: React.MutableRefObject<RadarViewControls | null>;
  focusedSegmentIdx: number | null;
  focusModeActive: boolean;
  onSegmentClick: (idx: number) => void;
  onFocusExitComplete: () => void;
  svgRef?: React.Ref<SVGSVGElement>;
  onFitZoomChange?: (z: number) => void;
  centerLogoUrl?: string;
  cycleLabel?: string;
  cycleLabelColor?: string;
  colorMode?: ColorMode;
  shapeMode?: ShapeMode;
  /**
   * Fired when the user clicks the focus-escape pill ("← All segments").
   * Rendered inside RadarView's legend overlay so it always sits directly
   * below the legend regardless of how the legend resizes with filter
   * options or color/shape mode changes.
   */
  onFocusExit?: () => void;
};

export function RadarView({
  data,
  relations,
  loading,
  filters,
  selectedEntry,
  onEntryClick,
  zoom,
  translate,
  onZoomChange,
  onTranslateChange,
  controlsRef,
  focusedSegmentIdx,
  focusModeActive,
  onSegmentClick,
  onFocusExitComplete,
  svgRef,
  onFitZoomChange,
  centerLogoUrl,
  cycleLabel,
  cycleLabelColor,
  colorMode = "segment",
  shapeMode = "dot",
  onFocusExit,
}: Props) {
  const [hoveredEntry, setHoveredEntry] = useState<RadarEntry | null>(null);
  const resolvedCycleLabelColor = cycleLabelColor
    ? themeByKey(cycleLabelColor).labelText
    : "var(--color-brand-dark-blue)";
  const [legendOpen, setLegendOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const zoomRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragStartTransRef = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rootGRef = useRef<SVGGElement>(null);
  const focusGRef = useRef<SVGGElement>(null);
  const focusPivotRef = useRef<SVGGElement>(null);
  const focusInversePivotRef = useRef<SVGGElement>(null);
  const focusLabelsRef = useRef<SVGGElement>(null);
  const focusModeActiveRef = useRef(false);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  // Cached pre-focus zoom/translate so exit can animate back without a fresh
  // computeFit — Chrome's getBBox on rootG reflects focusG's live CSS transform,
  // so during the exit transition bbox is mid-animation and yields a wrong fit.
  const preFocusViewRef = useRef<{
    zoom: number;
    translate: { x: number; y: number };
  } | null>(null);
  // Drives rootG's CSS transition. Default "none" keeps drag/wheel responsive;
  // set to a transition string only while a focus enter/exit is in flight.
  const rootTransitionRef = useRef<string>("none");
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror focus state so the controls' reset() callback (built once in an
  // effect) can read the current focus without re-creating itself per render.
  const focusGeomRef = useRef<typeof focusGeom>(null);
  const focusedSegmentIdxRef = useRef<number | null>(null);

  zoomRef.current = zoom;
  translateRef.current = translate;
  focusModeActiveRef.current = focusModeActive;
  focusedSegmentIdxRef.current = focusedSegmentIdx;

  // getBBox is in viewBox coords and is independent of the CSS transform on <g>,
  // so the fit math doesn't depend on the transform useLayoutEffect having
  // already applied identity. Centering on the arc's symmetry axis (CX) instead
  // of the bbox center keeps the half-circle visually centered when left-side
  // and right-side label widths differ.
  const computeFit = useCallback(() => {
    const g = rootGRef.current;
    const svg = g?.ownerSVGElement;
    const el = svgContainerRef.current;
    if (!g || !svg || !el) return null;
    const bbox = g.getBBox();
    if (bbox.width <= 0 || bbox.height <= 0) return null;
    const cRect = el.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    if (cRect.width <= 0 || cRect.height <= 0) return null;

    const vbScale = Math.min(svgRect.width / SVG_W, svgRect.height / VB_H);
    if (!Number.isFinite(vbScale) || vbScale <= 0) return null;

    const symX_vb = CX;
    const symY_vb = CY - R_OUTER / 2;

    const vbCenterX_css = svgRect.left - cRect.left + svgRect.width / 2;
    const vbCenterY_css = svgRect.top - cRect.top + svgRect.height / 2;
    const symX_css = vbCenterX_css + (symX_vb - SVG_W / 2) * vbScale;
    const symY_css = vbCenterY_css + (symY_vb - (VB_Y + VB_H / 2)) * vbScale;

    const PAD = 16;
    const availW = Math.max(1, cRect.width - PAD * 2);
    const availH = Math.max(1, cRect.height - PAD * 2);

    // Bbox-based fit so the arc fills the available space efficiently (no
    // wasted slack from doubling around an asymmetric symmetry point).
    // 0.945 leaves breathing room so the dome doesn't kiss the container edges.
    const contentW_css = bbox.width * vbScale;
    const contentH_css = bbox.height * vbScale;
    const fitZoom =
      Math.min(availW / contentW_css, availH / contentH_css) * 0.945;

    // Horizontal: clamp using the full bbox so left/right labels stay inside.
    const distLeft = fitZoom * vbScale * (symX_vb - bbox.x);
    const distRight = fitZoom * vbScale * (bbox.x + bbox.width - symX_vb);
    const minX = PAD + distLeft;
    const maxX = cRect.width - PAD - distRight;
    const idealX = cRect.width / 2 - cRect.width * 0.025;
    const targetX = Math.max(minX, Math.min(idealX, maxX));

    // Vertical: clamp using the ARC ONLY at the top (the arc top must stay
    // visible) and the full bbox at the bottom (ring labels must stay
    // visible). This deliberately lets the rotated tech labels above the dome
    // clip out the top of the container so the arc itself is visually
    // centered — without this, on tall/wide containers the bbox-based clamp
    // forces the baseline to the bottom edge.
    const distTopArc = fitZoom * vbScale * (R_OUTER / 2);
    const distBottomBbox = fitZoom * vbScale * (bbox.y + bbox.height - symY_vb);
    const minY = PAD + distTopArc;
    const maxY = cRect.height - PAD - distBottomBbox;
    // Bias below container center so the dome doesn't feel top-heavy, then
    // shift 5% up to set the new home position.
    const idealY = cRect.height * 0.6 - cRect.height * 0.05;
    const targetY = Math.max(minY, Math.min(idealY, maxY));

    return {
      zoom: fitZoom,
      translate: {
        x: targetX - fitZoom * symX_css,
        y: targetY - fitZoom * symY_css,
      },
    };
  }, []);

  const applyFit = useCallback(() => {
    const fit = computeFit();
    if (!fit) return;
    onZoomChange(fit.zoom);
    onTranslateChange(fit.translate);
    onFitZoomChange?.(fit.zoom);
  }, [computeFit, onZoomChange, onTranslateChange, onFitZoomChange]);

  // Fit the focused slice (not the full half-circle) into the wrapper so the
  // slice fills the available space and is centered without manual pan/zoom.
  const computeFocusFit = useCallback(
    (
      geom: {
        focusScale: number;
        targetApexX: number;
        targetApexY: number;
        sliceHalfHeight: number;
        segHalfAngle: number;
      } | null,
    ) => {
      const svg = rootGRef.current?.ownerSVGElement;
      const el = svgContainerRef.current;
      if (!geom || !svg || !el) return null;
      const cRect = el.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      if (cRect.width <= 0 || cRect.height <= 0) return null;
      const vbScale = Math.min(svgRect.width / SVG_W, svgRect.height / VB_H);
      if (!Number.isFinite(vbScale) || vbScale <= 0) return null;

      const { focusScale, targetApexX, targetApexY, sliceHalfHeight } = geom;
      // Slice geometric bbox in viewBox coords.
      const sliceLeft = targetApexX - focusScale * R_OUTER;
      const sliceRight = targetApexX;
      const sliceTop = targetApexY - sliceHalfHeight;
      const sliceBottom = targetApexY + sliceHalfHeight;
      // Padding in viewBox units to give labels (segment + tech + ring) room.
      const PAD_VB_X = 70;
      const PAD_VB_Y_TOP = 32;
      const PAD_VB_Y_BOT = 24;
      const bboxX = sliceLeft - PAD_VB_X;
      const bboxY = sliceTop - PAD_VB_Y_TOP;
      const bboxW = sliceRight - sliceLeft + PAD_VB_X * 2;
      const bboxH = sliceBottom - sliceTop + PAD_VB_Y_TOP + PAD_VB_Y_BOT;

      const centerX_vb = bboxX + bboxW / 2;
      const centerY_vb = bboxY + bboxH / 2;

      const vbCenterX_css = svgRect.left - cRect.left + svgRect.width / 2;
      const vbCenterY_css = svgRect.top - cRect.top + svgRect.height / 2;
      const centerX_css = vbCenterX_css + (centerX_vb - SVG_W / 2) * vbScale;
      const centerY_css =
        vbCenterY_css + (centerY_vb - (VB_Y + VB_H / 2)) * vbScale;

      const PAD_CSS = 16;
      const availW = Math.max(1, cRect.width - PAD_CSS * 2);
      const availH = Math.max(1, cRect.height - PAD_CSS * 2);
      const contentW_css = bboxW * vbScale;
      const contentH_css = bboxH * vbScale;
      // 0.741 reduces the focus fit so the slice settles around 105% absolute
      // (was 141% pre-tuning) — the sidebar's normalized display still reads
      // 100% at this fit.
      const fitZoom =
        Math.min(availW / contentW_css, availH / contentH_css) * 0.72;

      // Shift the slice ~10% of the wrapper width to the right of center.
      const X_OFFSET = cRect.width * 0.05;

      return {
        zoom: fitZoom,
        translate: {
          x: cRect.width / 2 - fitZoom * centerX_css + X_OFFSET,
          y: cRect.height / 2 - fitZoom * centerY_css,
        },
      };
    },
    [],
  );

  const applyFocusFit = useCallback(
    (geom: typeof focusGeom) => {
      const fit = computeFocusFit(geom);
      if (!fit) return;
      onZoomChange(fit.zoom);
      onTranslateChange(fit.translate);
      onFitZoomChange?.(fit.zoom);
    },
    // focusGeom intentionally omitted: callers pass the geom snapshot they
    // want to fit against (avoids stale-closure issues inside the focus effect).
    [computeFocusFit, onZoomChange, onTranslateChange, onFitZoomChange],
  );

  const setZoomAbsolute = useCallback(
    (target: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const s = zoomRef.current;
      const newS = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, target));
      if (newS === s) return;
      const k = newS / s;
      const t = translateRef.current;
      onZoomChange(newS);
      onTranslateChange({ x: cx - k * (cx - t.x), y: cy - k * (cy - t.y) });
    },
    [onZoomChange, onTranslateChange],
  );

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      setZoom: setZoomAbsolute,
      reset: () => {
        // While focused, the home button should restore the focus fit (the
        // exact view we land on right after clicking the segment label),
        // not exit focus mode. Outside focus, fall back to the radar fit.
        if (focusedSegmentIdxRef.current !== null && focusGeomRef.current) {
          applyFocusFit(focusGeomRef.current);
        } else {
          applyFit();
        }
      },
    };
    return () => {
      if (controlsRef.current) controlsRef.current = null;
    };
  }, [controlsRef, setZoomAbsolute, applyFit, applyFocusFit]);

  const sortedSegments = useMemo(
    () => [...data.segments].sort((a, b) => a.order - b.order),
    [data.segments],
  );

  const sortedRings = useMemo(
    () => [...data.rings].sort((a, b) => a.order - b.order),
    [data.rings],
  );

  const segLayout = useMemo(() => {
    const N = sortedSegments.length;
    const counts = sortedSegments.map(
      (seg) => data.entries.filter((e) => e.segment_id === seg.id).length,
    );
    const totalSlots = counts.reduce((a, b) => a + b, 0) + N;
    const delta =
      totalSlots > 0 ? Math.PI / totalSlots : Math.PI / Math.max(N, 1);
    const cumSlots: number[] = new Array(N + 1);
    let offset = 0;
    for (let i = 0; i < N; i++) {
      cumSlots[i] = offset;
      offset += 1 + (counts[i] ?? 0);
    }
    cumSlots[N] = offset;
    return { delta, cumSlots };
  }, [sortedSegments, data.entries]);

  const arcDots = useMemo<ArcDatum[]>(() => {
    const N = sortedSegments.length;
    if (N === 0 || sortedRings.length === 0) return [];
    const step = (R_OUTER - R_INNER) / sortedRings.length;
    const ringIdxMap = new Map<string, number>(
      sortedRings.map((ring, i) => [ring.name, i]),
    );
    const result: ArcDatum[] = [];
    sortedSegments.forEach((seg, segIdx) => {
      const segEntries = data.entries.filter((e) => e.segment_id === seg.id);
      const theme = themeByKey(seg.theme_key);
      segEntries.forEach((entry, j) => {
        const angle =
          Math.PI -
          ((segLayout.cumSlots[segIdx] ?? 0) + 1 + j) * segLayout.delta;
        const ringIdx = entry.ring ? ringIdxMap.get(entry.ring) : undefined;
        let dotR: number;
        if (ringIdx === undefined) {
          dotR = R_OUTER;
        } else {
          const baseR = R_INNER + (ringIdx + 0.5) * step;
          const radialFrac = hash01(entry.topic_id) * 2 - 1;
          dotR = baseR + radialFrac * (step / 2) * DOT_RADIAL_JITTER;
        }
        result.push({
          ...entry,
          angle,
          arcX: CX + dotR * Math.cos(angle),
          arcY: CY - dotR * Math.sin(angle),
          segmentIndex: segIdx,
          color: theme.dot,
        });
      });
    });
    return result;
  }, [data, sortedSegments, sortedRings, segLayout]);

  const positionById = useMemo(() => {
    const m = new Map<string, ArcDatum>();
    arcDots.forEach((d) => m.set(d.topic_id, d));
    return m;
  }, [arcDots]);

  const focusGeom = useMemo(() => {
    if (focusedSegmentIdx === null) return null;
    const N = sortedSegments.length;
    if (N === 0) return null;
    const boundaryAngles = segLayout.cumSlots.map(
      (slot) => Math.PI - slot * segLayout.delta,
    );
    const startAng = boundaryAngles[focusedSegmentIdx + 1] ?? 0;
    const endAng = boundaryAngles[focusedSegmentIdx] ?? Math.PI;
    const midAng = (startAng + endAng) / 2;
    const segHalfAngle = Math.max((endAng - startAng) / 2, 0.001);
    const sliceLength = R_OUTER;
    const sliceHeight = 2 * R_OUTER * Math.sin(segHalfAngle);
    const focusScale = Math.min(
      (SVG_W * 0.85) / sliceLength,
      (VB_H * 0.85) / sliceHeight,
    );
    const targetApexX = SVG_W / 2 + (focusScale * R_OUTER) / 2;
    const targetApexY = VB_Y + VB_H / 2;
    const sliceHalfHeight = focusScale * R_OUTER * Math.sin(segHalfAngle);
    // rotateRad maps the focused segment's mid-axis to math angle π (leftward
    // from apex) — same value the focus effect uses to drive focusG's CSS rotate.
    const rotateRad = midAng - Math.PI;
    return {
      focusScale,
      targetApexX,
      targetApexY,
      sliceHalfHeight,
      segHalfAngle,
      rotateRad,
    };
  }, [focusedSegmentIdx, segLayout, sortedSegments.length]);

  focusGeomRef.current = focusGeom;

  const activeEntry = selectedEntry ?? hoveredEntry;

  // Resolves the color shown on the dot (and its active label fill) given the
  // current colorMode. `d.color` carries the segment-theme color, used as the
  // default and the fallback when the dimension is missing.
  const dotColorFor = useCallback(
    (d: ArcDatum): string => {
      switch (colorMode) {
        case "segment":
          return d.color;
        case "ring":
          return RING_DOT_COLORS[d.ring ?? ""] ?? NO_VALUE_COLOR;
        case "trl":
          return trlBucketColor(d.trl);
        case "ttm":
          return TTM_COLORS[d.time_to_mainstream ?? ""] ?? NO_VALUE_COLOR;
        case "relevance":
          return (
            RELEVANCE_COLORS[d.strategic_relevance ?? ""] ?? NO_VALUE_COLOR
          );
        case "movement":
          return MOVEMENT_COLORS[d.movement ?? ""] ?? NO_VALUE_COLOR;
      }
    },
    [colorMode],
  );

  // Build the color → label mapping for the legend based on the active mode.
  const colorKey = useMemo<{ color: string; label: string }[]>(() => {
    switch (colorMode) {
      case "segment":
        return [...data.segments]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ color: themeByKey(s.theme_key).dot, label: s.name }));
      case "ring":
        return ["Invest", "Pilot", "Explore", "Monitor"].map((r) => ({
          color: RING_DOT_COLORS[r] ?? NO_VALUE_COLOR,
          label: r,
        }));
      case "trl":
        return [
          ...TRL_LEVELS.map((n) => ({
            color: TRL_COLOR_BY_LEVEL[n] ?? NO_VALUE_COLOR,
            label: `TRL ${n}`,
          })),
          { color: NO_VALUE_COLOR, label: "Unknown" },
        ];
      case "ttm":
        return [
          ...Object.entries(TTM_COLORS).map(([k, c]) => ({
            color: c,
            label: k,
          })),
          { color: NO_VALUE_COLOR, label: "Unknown" },
        ];
      case "relevance":
        return [
          ...Object.entries(RELEVANCE_COLORS).map(([k, c]) => ({
            color: c,
            label: k,
          })),
          { color: NO_VALUE_COLOR, label: "Unknown" },
        ];
      case "movement":
        return (
          [
            ["new", "New"],
            ["promoted", "Promoted"],
            ["demoted", "Demoted"],
            ["unchanged", "Unchanged"],
          ] as const
        ).map(([k, label]) => ({
          color: MOVEMENT_COLORS[k] ?? NO_VALUE_COLOR,
          label,
        }));
    }
  }, [colorMode, data.segments]);

  const activeRelations = useMemo(() => {
    if (!activeEntry) return [];
    return relations.filter(
      (r) =>
        r.from_topic_id === activeEntry.topic_id ||
        r.to_topic_id === activeEntry.topic_id,
    );
  }, [activeEntry, relations]);

  const relatedIds = useMemo<Set<string>>(() => {
    if (!activeEntry) return new Set();
    return new Set(
      activeRelations
        .flatMap((r) => [r.from_topic_id, r.to_topic_id])
        .filter((id) => id !== activeEntry.topic_id),
    );
  }, [activeEntry, activeRelations]);

  // For cross-segment relations in focus mode: lay out per-segment label
  // BOXES above/below the focused slice. Each box is a bordered rectangle
  // listing its destination topics; one arrow per box terminates at the
  // box's slice-facing edge. Position rule: segments AFTER focused sit ABOVE
  // by default; segments BEFORE sit BELOW. If a side runs out of vertical
  // space, overflow boxes fall back to the other side (furthest-from-focused
  // get bumped first since closest-to-focused stays priority).
  const crossSegmentLabelLayout = useMemo(() => {
    if (
      focusedSegmentIdx === null ||
      !focusGeom ||
      !activeEntry ||
      activeRelations.length === 0
    ) {
      return null;
    }
    const activeDot = positionById.get(activeEntry.topic_id);
    if (!activeDot || activeDot.segmentIndex !== focusedSegmentIdx) {
      return null;
    }

    type Row = { topicId: string; name: string; x: number; y: number };
    type Group = {
      segmentIndex: number;
      segmentName: string;
      themeColor: string;
      arrowStrokeColor: string;
      arrowDash: string | undefined;
      side: "above" | "below";
      x: number;
      y: number;
      width: number;
      height: number;
      header: { x: number; y: number };
      rows: Row[];
      arrowTarget: { x: number; y: number };
    };

    const PAD_X = 8;
    const PAD_Y = 4;
    const HEADER_H = 11;
    const HEADER_TO_ROW = 4;
    const ROW_H = 11;
    // Rough average glyph widths at the chosen font sizes — used only to
    // estimate box width without measuring real DOM. Slightly generous so
    // longer names don't get clipped. The header is bold UPPERCASE with
    // 0.04em letter-spacing, which is meaningfully wider than mixed-case
    // body text (M/W/A glyphs dominate the average).
    const HEADER_CHAR_W = 7.0;
    const ROW_CHAR_W = 4.2;
    // Width reserved for the "• " bullet prefix in front of each topic row.
    const BULLET_WIDTH = 10;
    const GROUP_GAP = 7;
    const EDGE_PAD_ABOVE = 28;
    const EDGE_PAD_BELOW = 16;

    // Mirror computeFocusFit's bbox padding + fill ratio so we can predict
    // the visible vb area after the focus fit is applied. The fit zooms the
    // slice bbox to fill 72% of the wrapper, leaving ~28% slack distributed
    // around the bbox. In the y-limiting case (typical for landscape
    // wrappers), about half that slack lands above the bbox and half below
    // — that's extra visible vb space available for cross-segment labels.
    const FOCUS_FIT_PAD_TOP = 32;
    const FOCUS_FIT_PAD_BOT = 24;
    const FOCUS_FIT_FILL_RATIO = 0.72;
    const focusBboxH =
      focusGeom.sliceHalfHeight * 2 + FOCUS_FIT_PAD_TOP + FOCUS_FIT_PAD_BOT;
    const fitSlackPerSide = (focusBboxH * (1 / FOCUS_FIT_FILL_RATIO - 1)) / 2;

    // Box left edge — shifted right of slice-center so the column sits closer
    // to the apex side and feels grouped with the focused slice.
    const labelX =
      focusGeom.targetApexX - focusGeom.focusScale * R_OUTER * 0.35;

    type BucketRow = {
      topicId: string;
      name: string;
      relationType: string;
    };
    const bySegment = new Map<number, { rows: BucketRow[] }>();
    activeRelations.forEach((rel) => {
      const fromDot = positionById.get(rel.from_topic_id);
      const toDot = positionById.get(rel.to_topic_id);
      if (!fromDot || !toDot) return;
      const fromInside = fromDot.segmentIndex === focusedSegmentIdx;
      const toInside = toDot.segmentIndex === focusedSegmentIdx;
      if (fromInside && toInside) return;
      if (!fromInside && !toInside) return;
      const outsideDot = fromInside ? toDot : fromDot;
      const segIdx = outsideDot.segmentIndex;
      let bucket = bySegment.get(segIdx);
      if (!bucket) {
        bucket = { rows: [] };
        bySegment.set(segIdx, bucket);
      }
      if (bucket.rows.some((r) => r.topicId === outsideDot.topic_id)) return;
      bucket.rows.push({
        topicId: outsideDot.topic_id,
        name: outsideDot.canonical_name,
        relationType: rel.relation_type,
      });
    });

    if (bySegment.size === 0) return null;

    type Draft = {
      segIdx: number;
      segName: string;
      themeColor: string;
      arrowStrokeColor: string;
      arrowDash: string | undefined;
      rows: BucketRow[];
      width: number;
      height: number;
      primary: "above" | "below";
    };

    const drafts: Draft[] = [];
    bySegment.forEach((bucket, segIdx) => {
      const seg = sortedSegments[segIdx];
      if (!seg) return;
      const headerW = seg.name.length * HEADER_CHAR_W;
      const bodyW = bucket.rows.reduce(
        (m, r) => Math.max(m, r.name.length * ROW_CHAR_W + BULLET_WIDTH),
        0,
      );
      const width = Math.max(headerW, bodyW) + PAD_X * 2;
      const height =
        PAD_Y + HEADER_H + HEADER_TO_ROW + bucket.rows.length * ROW_H + PAD_Y;
      const cats = new Set(
        bucket.rows
          .map((r) => relationCategory(r.relationType))
          .filter((c): c is RelationCategory => c !== null),
      );
      // Arrow color: when every relation in the box shares a category, we
      // can keep its color/dash; mixed categories fall back to a neutral
      // stroke so the legend isn't misleading.
      const arrowSpec =
        cats.size === 1
          ? RELATION_STROKES[cats.values().next().value as RelationCategory]
          : {
              color: "var(--color-muted-text)",
              dash: "4,3" as string | undefined,
            };
      drafts.push({
        segIdx,
        segName: seg.name,
        themeColor: themeByKey(seg.theme_key).labelText,
        arrowStrokeColor: arrowSpec.color,
        arrowDash: arrowSpec.dash,
        rows: bucket.rows,
        width,
        height,
        primary: segIdx > focusedSegmentIdx ? "above" : "below",
      });
    });

    // Process closest-to-focused first so the closest segments win their
    // primary side; far-out boxes fall back to the other side if needed.
    drafts.sort(
      (a, b) =>
        Math.abs(a.segIdx - focusedSegmentIdx) -
        Math.abs(b.segIdx - focusedSegmentIdx),
    );

    const sliceTopY =
      focusGeom.targetApexY - focusGeom.sliceHalfHeight - EDGE_PAD_ABOVE;
    const sliceBottomY =
      focusGeom.targetApexY + focusGeom.sliceHalfHeight + EDGE_PAD_BELOW;
    // Visible vb top/bottom assuming the focus fit is in effect. This is the
    // upper bound on the actual rendered viewport for content inside rootG;
    // in the y-limiting fit case it's tight, in the x-limiting case there's
    // more room (this conservative estimate just leaves the extra unused).
    const visVbTop =
      focusGeom.targetApexY -
      focusGeom.sliceHalfHeight -
      FOCUS_FIT_PAD_TOP -
      fitSlackPerSide;
    const visVbBot =
      focusGeom.targetApexY +
      focusGeom.sliceHalfHeight +
      FOCUS_FIT_PAD_BOT +
      fitSlackPerSide;
    const aboveAvail = sliceTopY - visVbTop;
    const belowAvail = visVbBot - sliceBottomY;

    const aboveDrafts: Draft[] = [];
    const belowDrafts: Draft[] = [];
    let aboveUsed = 0;
    let belowUsed = 0;
    const tryPlace = (d: Draft, side: "above" | "below"): boolean => {
      const list = side === "above" ? aboveDrafts : belowDrafts;
      const used = side === "above" ? aboveUsed : belowUsed;
      const avail = side === "above" ? aboveAvail : belowAvail;
      const needed = d.height + (list.length > 0 ? GROUP_GAP : 0);
      if (used + needed > avail) return false;
      list.push(d);
      if (side === "above") aboveUsed += needed;
      else belowUsed += needed;
      return true;
    };
    for (const draft of drafts) {
      const fallback = draft.primary === "above" ? "below" : "above";
      if (!tryPlace(draft, draft.primary) && !tryPlace(draft, fallback)) {
        // Both sides full — force into primary; the box may extend off-screen
        // but at least its placement matches the user's expectation.
        const list = draft.primary === "above" ? aboveDrafts : belowDrafts;
        list.push(draft);
        if (draft.primary === "above") aboveUsed += draft.height + GROUP_GAP;
        else belowUsed += draft.height + GROUP_GAP;
      }
    }

    const groups: Group[] = [];

    const buildGroup = (
      d: Draft,
      boxTop: number,
      side: "above" | "below",
    ): Group => {
      const headerY = boxTop + PAD_Y + HEADER_H / 2;
      const rows: Row[] = d.rows.map((r, ri) => ({
        topicId: r.topicId,
        name: r.name,
        x: labelX + PAD_X,
        y: boxTop + PAD_Y + HEADER_H + HEADER_TO_ROW + ri * ROW_H + ROW_H / 2,
      }));
      const arrowTarget = {
        x: labelX + d.width / 2,
        y: side === "above" ? boxTop + d.height : boxTop,
      };
      return {
        segmentIndex: d.segIdx,
        segmentName: d.segName,
        themeColor: d.themeColor,
        arrowStrokeColor: d.arrowStrokeColor,
        arrowDash: d.arrowDash,
        side,
        x: labelX,
        y: boxTop,
        width: d.width,
        height: d.height,
        header: { x: labelX + PAD_X, y: headerY },
        rows,
        arrowTarget,
      };
    };

    // Above stack: aboveDrafts[0] = closest-to-focused → its bottom edge sits
    // at sliceTopY; subsequent boxes stack upward from there.
    let cursorAbove = sliceTopY;
    aboveDrafts.forEach((d) => {
      const boxTop = cursorAbove - d.height;
      groups.push(buildGroup(d, boxTop, "above"));
      cursorAbove = boxTop - GROUP_GAP;
    });

    // Below stack: belowDrafts[0] = closest-to-focused → its top edge sits at
    // sliceBottomY; subsequent boxes stack downward.
    let cursorBelow = sliceBottomY;
    belowDrafts.forEach((d) => {
      groups.push(buildGroup(d, cursorBelow, "below"));
      cursorBelow += d.height + GROUP_GAP;
    });

    return { groups };
  }, [
    focusedSegmentIdx,
    focusGeom,
    activeEntry,
    activeRelations,
    positionById,
    sortedSegments,
  ]);

  useLayoutEffect(() => {
    const g = rootGRef.current;
    if (!g) return;
    g.style.transformOrigin = "0 0";
    // Promotes rootG to its own GPU compositor layer. Without this, WebKit
    // leaves paint trails ("ghost" artifacts) during rapid pan/zoom because
    // it doesn't always invalidate the prior paint region of a CSS-transformed
    // SVG subtree.
    g.style.willChange = "transform";
    g.style.transition = rootTransitionRef.current;
    g.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`;
  }, [zoom, translate]);

  // Initial fit + recompute on container resize and after fonts load (label
  // widths change once webfonts swap in, which shifts the bbox). Depends on
  // `loading` because the SVG unmounts/remounts when the loading state toggles
  // (relations data fetch), and we need to re-fit against the freshly-mounted <g>.
  useLayoutEffect(() => {
    if (loading) return;
    if (focusModeActive) return;
    applyFit();
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) applyFit();
      });
    }
    const el = svgContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return () => {
        cancelled = true;
      };
    }
    const ro = new ResizeObserver(() => {
      if (focusModeActiveRef.current) return;
      applyFit();
    });
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [applyFit, loading, focusModeActive]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      rootTransitionRef.current = "none";
      if (rootGRef.current) rootGRef.current.style.transition = "none";
      const rect = wrapper.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const s = zoomRef.current;
      const t = translateRef.current;
      // Normalize by deltaY magnitude so trackpads (many tiny events) and mice
      // (few large events) zoom at the same rate per pixel of scroll. Without
      // this, Mac trackpads zoomed ~50× faster than a wheel click.
      const f = Math.pow(WHEEL_ZOOM_FACTOR, -e.deltaY / WHEEL_ZOOM_NORMALIZE);
      const newS = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s * f));
      const k = newS / s;
      onZoomChange(newS);
      onTranslateChange({ x: cx - k * (cx - t.x), y: cy - k * (cy - t.y) });
    };
    wrapper.addEventListener("wheel", handler, { passive: false });
    return () => wrapper.removeEventListener("wheel", handler);
  }, [onZoomChange, onTranslateChange]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      if (target.closest("text, circle, button")) return;
      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragStartTransRef.current = translateRef.current;
      rootTransitionRef.current = "none";
      if (rootGRef.current) rootGRef.current.style.transition = "none";
      document.body.style.cursor = "grabbing";
    };

    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      onTranslateChange({
        x: dragStartTransRef.current.x + (e.clientX - dragStartRef.current.x),
        y: dragStartTransRef.current.y + (e.clientY - dragStartRef.current.y),
      });
    };

    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
    };

    wrapper.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      wrapper.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [onTranslateChange]);

  useLayoutEffect(() => {
    const fg = focusGRef.current;
    if (!fg) return;
    const N = sortedSegments.length;
    if (N === 0) return;

    const FOCUS_DURATION = 600;
    const FADE_MS = 220;
    const segBoundaryAngles = segLayout.cumSlots.map(
      (slot) => Math.PI - slot * segLayout.delta,
    );

    const dimSelector =
      "[data-seg-idx], [data-relview-ring], [data-relview-baseline]";
    const dividerSelector = "[data-divider-idx]";

    if (focusedSegmentIdx !== null) {
      const i = focusedSegmentIdx;
      const startAng = segBoundaryAngles[i + 1] ?? 0;
      const endAng = segBoundaryAngles[i] ?? Math.PI;
      const midAng = (startAng + endAng) / 2;
      const segHalfAngle = (endAng - startAng) / 2;

      // Aim the segment's mid-axis to math angle π (leftward) so the arc is on
      // the left and the apex on the right — matches the Radar focus orientation.
      // Per SVG rotate(α): math angle θ → θ - α, so α = midAng - π.
      const rotateDeg = (midAng - Math.PI) * (180 / Math.PI);

      const sliceLength = R_OUTER;
      const sliceHeight = 2 * R_OUTER * Math.sin(Math.max(segHalfAngle, 0.001));
      const focusScale = Math.min(
        (SVG_W * 0.85) / sliceLength,
        (VB_H * 0.85) / sliceHeight,
      );

      // Apex sits half a slice-length right of viewBox center, mirroring how the
      // Radar centers a focused slice (RadarSvg.tsx: `A = cx + (focusScale*outerR)/2`).
      const targetApexX = SVG_W / 2 + (focusScale * R_OUTER) / 2;
      const targetApexY = VB_Y + VB_H / 2;
      const sliceHalfHeight =
        focusScale * R_OUTER * Math.sin(Math.max(segHalfAngle, 0.001));

      // The original transform `translate(A) · scale(σ) · rotate(α) · translate(-C)`
      // is a spiral similarity f(p) = M·p + (A − M·C) where M = σ·R(α). CSS
      // matrix interpolation decomposes f into (translate, rotate, scale) and
      // interpolates each linearly — for far-side segments the translate
      // component is large (e.g. ~(1421, 1488)px), so the slice swings off
      // viewport mid-animation before settling.
      //
      // Reformulate as a rotation+scale around the unique fixed point q where
      // f(q) = q ⇒ q = (I − M)⁻¹·(A − M·C). With three groups
      //   focusPivot[translate(q)] → focusG[scale·rotate] → inversePivot[translate(−q)]
      // the composed transform equals the original at start (identity) and end,
      // but only focusG animates and its decomposed translate is 0. CSS now
      // interpolates pure rotation+scale around the pivot — a bounded spiral
      // path that stays inside the viewport.
      const rotateRad = midAng - Math.PI;
      const cosA = Math.cos(rotateRad);
      const sinA = Math.sin(rotateRad);
      const a = 1 - focusScale * cosA;
      const b = focusScale * sinA;
      const det = a * a + b * b;
      const tx = targetApexX - focusScale * (cosA * CX - sinA * CY);
      const ty = targetApexY - focusScale * (sinA * CX + cosA * CY);
      let qx = CX;
      let qy = CY;
      if (det > 1e-6) {
        qx = (a * tx - b * ty) / det;
        qy = (b * tx + a * ty) / det;
      }

      // Snapshot the unfocused view so exit can animate back to it without
      // recomputing fit (which would be wrong while focusG is mid-transition).
      if (preFocusViewRef.current === null) {
        preFocusViewRef.current = {
          zoom: zoomRef.current,
          translate: { ...translateRef.current },
        };
      }

      // Animate rootG with the same easing/duration as focusG so the combined
      // transform interpolates along a smooth path instead of rootG jumping
      // instantly to the focus-fit while focusG is still mid-animation.
      rootTransitionRef.current = `transform ${FOCUS_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;

      const pivotEl = focusPivotRef.current;
      const inversePivotEl = focusInversePivotRef.current;
      if (pivotEl) pivotEl.style.transform = `translate(${qx}px, ${qy}px)`;
      if (inversePivotEl)
        inversePivotEl.style.transform = `translate(${-qx}px, ${-qy}px)`;
      fg.style.transform = `scale(${focusScale}) rotate(${rotateDeg}deg)`;

      // Fit the focused slice (not the full half-circle) into the wrapper so
      // the slice fills the viewport without manual pan/zoom. Pass an explicit
      // geom snapshot rather than relying on the memoized focusGeom because
      // this effect runs synchronously on focusedSegmentIdx change before
      // the next render commits the new focusGeom value.
      applyFocusFit({
        focusScale,
        targetApexX,
        targetApexY,
        sliceHalfHeight,
        segHalfAngle: Math.max(segHalfAngle, 0.001),
        rotateRad,
      });

      fg.querySelectorAll<SVGElement>(dimSelector).forEach((el) => {
        const segAttr = el.getAttribute("data-seg-idx");
        const isFocusedSeg = segAttr !== null && Number(segAttr) === i;
        const hasSegAttr = segAttr !== null;
        el.style.transition = `opacity ${FADE_MS}ms ease`;
        // Elements without seg-idx (rings, baseline, relations group) always fade.
        // Elements with seg-idx fade unless they belong to the focused segment.
        el.style.opacity = !hasSegAttr || !isFocusedSeg ? "0" : "";
        el.style.pointerEvents = !hasSegAttr || !isFocusedSeg ? "none" : "";
      });

      // Segment dividers: keep the two that bound the focused segment.
      fg.querySelectorAll<SVGElement>(dividerSelector).forEach((el) => {
        const idx = Number(el.getAttribute("data-divider-idx"));
        const isBound = idx === i || idx === i + 1;
        el.style.transition = `opacity ${FADE_MS}ms ease`;
        el.style.opacity = isBound ? "" : "0";
      });

      // Ring labels — hold at 0 until the slice has settled, then fade in.
      // setTimeout (rather than CSS transition-delay + RAF) avoids the race
      // where the initial 0 isn't painted before the value is set back to 1.
      const labels = focusLabelsRef.current;
      if (labels) labels.style.opacity = "0";
      const labelsTimer = setTimeout(() => {
        if (focusLabelsRef.current) focusLabelsRef.current.style.opacity = "1";
      }, 480);

      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        rootTransitionRef.current = "none";
        if (rootGRef.current) rootGRef.current.style.transition = "none";
        focusTimerRef.current = null;
      }, FOCUS_DURATION + 20);

      return () => {
        clearTimeout(labelsTimer);
      };
    }

    if (focusModeActive) {
      // Animate rootG back in step with focusG so the slice settles smoothly
      // instead of rootG snapping to a stale (bbox-polluted) all-segments fit.
      rootTransitionRef.current = `transform ${FOCUS_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;

      fg.style.transform = "";

      // Restore the exact view we had before entering focus. Computing fit
      // here would be wrong: Chrome's getBBox on rootG reflects focusG's live
      // CSS transform, so during the exit transition bbox is mid-animation
      // and applyFit would yield the "tiny" fit the user reported. The
      // post-exit useLayoutEffect (gated on !focusModeActive) re-runs applyFit
      // once the animation has settled, picking up any container resize.
      const cached = preFocusViewRef.current;
      if (cached) {
        onZoomChange(cached.zoom);
        onTranslateChange(cached.translate);
      } else {
        applyFit();
      }

      // Delay the dimmed-elements fade-in so the rest of the semi-circle only
      // appears as the focused slice arrives back in place — without this they
      // pop in at t=0 while the slice is still rotating.
      const EXIT_REVEAL_DELAY = 360;
      const EXIT_REVEAL_DURATION = 240;
      fg.querySelectorAll<SVGElement>(dimSelector).forEach((el) => {
        el.style.transition = `opacity ${EXIT_REVEAL_DURATION}ms ease ${EXIT_REVEAL_DELAY}ms`;
        el.style.opacity = "";
        el.style.pointerEvents = "";
      });
      fg.querySelectorAll<SVGElement>(dividerSelector).forEach((el) => {
        el.style.transition = `opacity ${EXIT_REVEAL_DURATION}ms ease ${EXIT_REVEAL_DELAY}ms`;
        el.style.opacity = "";
      });

      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        rootTransitionRef.current = "none";
        if (rootGRef.current) rootGRef.current.style.transition = "none";
        if (focusPivotRef.current) focusPivotRef.current.style.transform = "";
        if (focusInversePivotRef.current)
          focusInversePivotRef.current.style.transform = "";
        preFocusViewRef.current = null;
        focusTimerRef.current = null;
        onFocusExitComplete();
      }, FOCUS_DURATION + 20);

      return undefined;
    }

    return undefined;
  }, [
    focusedSegmentIdx,
    focusModeActive,
    segLayout,
    sortedSegments.length,
    onFocusExitComplete,
    applyFit,
    applyFocusFit,
    onZoomChange,
    onTranslateChange,
  ]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-muted-text)",
          fontFamily: "var(--font-family)",
        }}
      >
        Loading relations…
      </div>
    );
  }

  const bandStep =
    sortedRings.length > 0 ? (R_OUTER - R_INNER) / sortedRings.length : 0;
  const segBoundaryAngles = segLayout.cumSlots.map(
    (slot) => Math.PI - slot * segLayout.delta,
  );

  return (
    <div
      ref={wrapperRef}
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "var(--color-page-background)",
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      <div
        ref={svgContainerRef}
        style={{ width: "100%", height: "100%", position: "relative" }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 ${VB_Y} ${SVG_W} ${VB_H}`}
          style={{ display: "block", overflow: "hidden" }}
          aria-label="Radar arc view"
        >
          <defs>
            {/* Arrow head for relations that cross the focused segment boundary.
            fill="context-stroke" inherits the path's stroke color so each
            relation category keeps its own hue without per-category markers. */}
            <marker
              id="radarview-rel-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                fill="context-stroke"
                fillOpacity={0.7}
              />
            </marker>
          </defs>
          <g ref={rootGRef}>
            <g ref={focusPivotRef} style={{ transformOrigin: "0 0" }}>
              <g
                ref={focusGRef}
                style={{
                  transformOrigin: "0 0",
                  transition: "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <g
                  ref={focusInversePivotRef}
                  style={{ transformOrigin: "0 0" }}
                >
                  {/* Segment × ring background cells. Each (segment, ring) is its
              own band so sidebar segment + ring filters can dim the cells that
              don't match. Cell is bright iff segment filter matches AND ring
              filter matches; either filter being empty means "no filter on this
              axis" → matches everything. */}
                  {sortedSegments.flatMap((seg, segIdx) => {
                    const theme = themeByKey(seg.theme_key);
                    const sStart = segBoundaryAngles[segIdx + 1] ?? 0;
                    const sEnd = segBoundaryAngles[segIdx] ?? Math.PI;
                    return sortedRings.map((ring, ringIdx) => {
                      const innerR = R_INNER + ringIdx * bandStep;
                      const outerR = R_INNER + (ringIdx + 1) * bandStep;
                      const isActive = cellMatchesFilter(
                        seg.name,
                        ring.name,
                        filters,
                      );
                      return (
                        <path
                          key={`fill-${seg.id}-${ring.id}`}
                          data-seg-idx={segIdx}
                          d={segBandPath(CX, CY, innerR, outerR, sStart, sEnd)}
                          fill={theme.sliceFill}
                          fillOpacity={isActive ? 1 : 0.25}
                          style={{ transition: "fill-opacity 120ms ease" }}
                        />
                      );
                    });
                  })}

                  {/* Ring boundary arcs */}
                  {Array.from({ length: sortedRings.length + 1 }, (_, i) => {
                    const r = R_INNER + i * bandStep;
                    const isEdge = i === 0 || i === sortedRings.length;
                    return (
                      <path
                        key={`ring-${i}`}
                        data-relview-ring
                        d={halfArcPath(CX, CY, r)}
                        fill="none"
                        stroke="var(--color-ring-boundary)"
                        strokeWidth={isEdge ? 1 : 0.5}
                        strokeDasharray={isEdge ? undefined : "3,3"}
                      />
                    );
                  })}

                  {/* Ring labels — below baseline, centered on each ring band on
              both the left and right sides of the donut. */}
                  {sortedRings.flatMap((ring, i) => {
                    const centerR = R_INNER + (i + 0.5) * bandStep;
                    return [
                      <text
                        key={`rlabel-r-${ring.id}`}
                        data-relview-ring
                        x={CX + centerR}
                        y={CY + 13}
                        textAnchor="middle"
                        fontSize={8}
                        fill="var(--color-muted-text)"
                        fontFamily="var(--font-family)"
                      >
                        {ring.name}
                      </text>,
                      <text
                        key={`rlabel-l-${ring.id}`}
                        data-relview-ring
                        x={CX - centerR}
                        y={CY + 13}
                        textAnchor="middle"
                        fontSize={8}
                        fill="var(--color-muted-text)"
                        fontFamily="var(--font-family)"
                      >
                        {ring.name}
                      </text>,
                    ];
                  })}

                  {/* Per-segment ring boundary arc fragments — overlap the full half-arcs
              so they're invisible in unfocused view, but stay visible (per
              data-seg-idx) when their segment is focused after the half-arcs fade. */}
                  {sortedSegments.flatMap((seg, segIdx) => {
                    const sStart = segBoundaryAngles[segIdx + 1] ?? 0;
                    const sEnd = segBoundaryAngles[segIdx] ?? Math.PI;
                    return Array.from(
                      { length: sortedRings.length + 1 },
                      (_, ringIdx) => {
                        const r = R_INNER + ringIdx * bandStep;
                        const isEdge =
                          ringIdx === 0 || ringIdx === sortedRings.length;
                        return (
                          <path
                            key={`ringseg-${seg.id}-${ringIdx}`}
                            data-seg-idx={segIdx}
                            data-relview-ringseg
                            d={arcSegmentPath(CX, CY, r, sStart, sEnd)}
                            fill="none"
                            stroke="var(--color-ring-boundary)"
                            strokeWidth={isEdge ? 1 : 0.5}
                            strokeDasharray={isEdge ? undefined : "3,3"}
                          />
                        );
                      },
                    );
                  })}

                  {/* Segment radial dividers */}
                  {segBoundaryAngles.map((angle, i) => (
                    <line
                      key={`div-${i}`}
                      data-divider-idx={i}
                      x1={CX + R_INNER * Math.cos(angle)}
                      y1={CY - R_INNER * Math.sin(angle)}
                      x2={CX + R_OUTER * Math.cos(angle)}
                      y2={CY - R_OUTER * Math.sin(angle)}
                      stroke="var(--color-ring-boundary)"
                      strokeWidth={0.8}
                    />
                  ))}

                  {/* Segment labels — anchored to the CCW (left) edge of each segment */}
                  {sortedSegments.map((seg, i) => {
                    const theme = themeByKey(seg.theme_key);
                    const boundaryAngle =
                      Math.PI - (segLayout.cumSlots[i] ?? 0) * segLayout.delta;
                    const lx = CX + LABEL_R * Math.cos(boundaryAngle);
                    const ly = CY - LABEL_R * Math.sin(boundaryAngle);
                    const angleDeg = boundaryAngle * (180 / Math.PI);
                    // When this segment is the one being focused, the focusG transform
                    // rotates the slice so its centerline points left — geometrically
                    // the slice acts like a left-half slice regardless of its original
                    // position. Force left-half label conventions so the local rotation
                    // composes with the focus rotation into a right-side-up screen
                    // orientation (instead of flipping ~180° for right-half originals).
                    const treatAsLeftHalf =
                      focusedSegmentIdx === i ? true : angleDeg > 90;
                    const anchor = treatAsLeftHalf ? "end" : "start";
                    const rotateDeg = treatAsLeftHalf
                      ? 180 - angleDeg
                      : -angleDeg;
                    // Right-half labels (when not focused) read clockwise on screen, so the
                    // arrow goes at the trailing end of the text and points down.
                    const isReadingDownward = !treatAsLeftHalf;
                    const label = isReadingDownward
                      ? `${seg.name.toUpperCase()} ▼`
                      : `▲ ${seg.name.toUpperCase()}`;
                    return (
                      <text
                        key={`slabel-${seg.id}`}
                        data-seg-idx={i}
                        data-relview-seglabel
                        x={lx}
                        y={ly}
                        transform={`rotate(${rotateDeg}, ${lx}, ${ly})`}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        fontSize={
                          focusedSegmentIdx !== null
                            ? 10 * FOCUS_INNER_SCALE
                            : 10
                        }
                        fontWeight="bold"
                        fill={theme.labelText}
                        fontFamily="var(--font-family)"
                        style={{
                          letterSpacing: "0.04em",
                          cursor: focusModeActive ? "default" : "pointer",
                          pointerEvents: focusModeActive ? "none" : "auto",
                        }}
                        onClick={() => {
                          if (!focusModeActive) onSegmentClick(i);
                        }}
                      >
                        {label}
                      </text>
                    );
                  })}

                  {/* Relation bezier curves — only shown when an entry is
              selected/hovered. In focus mode, only relations whose endpoints
              both sit inside the focused segment render here (they get the
              focus rotation/scale for free). Cross-segment relations are
              rendered as a sibling of focusG so they can extend out to the
              per-segment label groups. */}
                  <g>
                    {activeRelations.map((rel) => {
                      const fromDot = positionById.get(rel.from_topic_id);
                      const toDot = positionById.get(rel.to_topic_id);
                      if (!fromDot || !toDot) return null;

                      if (focusedSegmentIdx !== null) {
                        const fromInside =
                          fromDot.segmentIndex === focusedSegmentIdx;
                        const toInside =
                          toDot.segmentIndex === focusedSegmentIdx;
                        if (!fromInside || !toInside) return null;
                      }

                      const cpFraction = 0.38;
                      const c1x =
                        fromDot.arcX + (CX - fromDot.arcX) * cpFraction;
                      const c1y =
                        fromDot.arcY + (CY - fromDot.arcY) * cpFraction;
                      const c2x = toDot.arcX + (CX - toDot.arcX) * cpFraction;
                      const c2y = toDot.arcY + (CY - toDot.arcY) * cpFraction;

                      const stroke = relationStroke(rel.relation_type);
                      return (
                        <path
                          key={rel.id}
                          d={`M ${fromDot.arcX} ${fromDot.arcY} C ${c1x} ${c1y} ${c2x} ${c2y} ${toDot.arcX} ${toDot.arcY}`}
                          fill="none"
                          stroke={stroke.color}
                          strokeWidth={0.9}
                          strokeOpacity={0.55}
                          strokeDasharray={stroke.dash}
                        />
                      );
                    })}
                  </g>

                  {/* Connector lines — label to dot. Active connector darkens
              (most), related connectors darken slightly (less than active),
              other connectors keep their default opacity. */}
                  <g pointerEvents="none">
                    {arcDots.map((d) => {
                      const visible = isVisible(d, data, filters);
                      // Hover should still trigger the effect even when an entry
                      // is pinned via click — so isActive considers both states
                      // independently rather than reading from activeEntry.
                      const isActive =
                        selectedEntry?.id === d.id || hoveredEntry?.id === d.id;
                      const isRelated = relatedIds.has(d.id);
                      const lineOpacity = isActive
                        ? 0.7
                        : isRelated
                          ? 0.5
                          : visible
                            ? 0.2
                            : 0.04;
                      const lineStroke =
                        isActive || isRelated
                          ? "var(--color-muted-text)"
                          : "var(--color-ring-boundary)";
                      const lx = CX + LABEL_R * Math.cos(d.angle);
                      const ly = CY - LABEL_R * Math.sin(d.angle);
                      return (
                        <line
                          key={`conn-${d.id}`}
                          data-seg-idx={d.segmentIndex}
                          x1={lx}
                          y1={ly}
                          x2={d.arcX}
                          y2={d.arcY}
                          stroke={lineStroke}
                          strokeWidth={isActive ? 0.9 : 0.5}
                          opacity={lineOpacity}
                          style={{
                            transition:
                              "stroke 120ms, opacity 120ms, stroke-width 120ms",
                          }}
                        />
                      );
                    })}
                  </g>

                  {/* Technology labels — radially outward at LABEL_R */}
                  <g pointerEvents="visiblePainted">
                    {arcDots.map((d) => {
                      const visible = isVisible(d, data, filters);
                      const isActive =
                        selectedEntry?.id === d.id || hoveredEntry?.id === d.id;
                      const isRelated = relatedIds.has(d.id);
                      const opacity = activeEntry
                        ? isActive
                          ? 1
                          : isRelated
                            ? 0.92
                            : 0.12
                        : visible
                          ? 0.8
                          : 0.1;
                      const angleDeg = d.angle * (180 / Math.PI);
                      // See segment-label note: when this entry's segment is focused,
                      // treat all labels as left-half so the focus rotation composes
                      // into a readable orientation in screen coords.
                      const treatAsLeftHalf =
                        focusedSegmentIdx === d.segmentIndex
                          ? true
                          : angleDeg > 90;
                      const anchor = treatAsLeftHalf ? "end" : "start";
                      const rotateDeg = treatAsLeftHalf
                        ? 180 - angleDeg
                        : -angleDeg;
                      const lx = CX + LABEL_R * Math.cos(d.angle);
                      const ly = CY - LABEL_R * Math.sin(d.angle);
                      const baseFontSize =
                        focusedSegmentIdx !== null ? 9 * FOCUS_INNER_SCALE : 9;
                      const renderedFontSize = isActive
                        ? baseFontSize * 1.18
                        : baseFontSize;
                      const isClicked = selectedEntry?.id === d.id;

                      // Hit rect sized to the bumped fontSize so the rect always
                      // covers the rendered text — including when it grows on
                      // hover. Prevents flicker at label edges where a smaller
                      // hit rect would lose the hover as the text grows past it.
                      const hitWidth =
                        d.canonical_name.length * (baseFontSize * 1.18 * 0.667);
                      const rectX = anchor === "end" ? lx - hitWidth : lx;

                      return (
                        <g
                          key={d.id}
                          data-seg-idx={d.segmentIndex}
                          data-entry-id={d.id}
                          data-demo-kind="label"
                          transform={`rotate(${rotateDeg}, ${lx}, ${ly})`}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={() => {
                            if (hoverClearTimerRef.current) {
                              clearTimeout(hoverClearTimerRef.current);
                              hoverClearTimerRef.current = null;
                            }
                            setHoveredEntry(d);
                          }}
                          onMouseLeave={() => {
                            hoverClearTimerRef.current = setTimeout(
                              () => setHoveredEntry(null),
                              16,
                            );
                          }}
                          onClick={() => onEntryClick(d)}
                        >
                          <rect
                            x={rectX}
                            y={ly - 8}
                            width={hitWidth}
                            height={16}
                            fill="transparent"
                          />
                          <text
                            x={lx}
                            y={ly}
                            opacity={opacity}
                            textAnchor={anchor}
                            dominantBaseline="middle"
                            fontFamily="var(--font-family)"
                            fill={
                              isActive
                                ? dotColorFor(d)
                                : "var(--color-dark-text)"
                            }
                            fontWeight={isClicked ? "bold" : "normal"}
                            style={{
                              userSelect: "none",
                              pointerEvents: "none",
                              fontSize: `${renderedFontSize}px`,
                              transition: "opacity 120ms, font-size 120ms",
                            }}
                          >
                            {d.canonical_name}
                          </text>
                        </g>
                      );
                    })}
                  </g>

                  {/* Dots — at ring-specific radius */}
                  <g>
                    {arcDots.map((d) => {
                      const visible = isVisible(d, data, filters);
                      const isActive =
                        selectedEntry?.id === d.id || hoveredEntry?.id === d.id;
                      const isRelated = relatedIds.has(d.id);
                      const opacity = activeEntry
                        ? isActive
                          ? 1
                          : isRelated
                            ? 0.95
                            : 0.15
                        : visible
                          ? 1
                          : 0.15;
                      const baseR =
                        selectedEntry?.id === d.id
                          ? 6
                          : isActive
                            ? 5.6
                            : isRelated
                              ? 5
                              : 4.5;
                      // The focus transform enlarges the slice, so the raw radius
                      // is scaled down — sharing FOCUS_INNER_SCALE with labels for
                      // visual consistency between dots and text in focus mode.
                      const r =
                        focusedSegmentIdx !== null
                          ? baseR * FOCUS_INNER_SCALE
                          : baseR;

                      const fill = dotColorFor(d);
                      const handlers = {
                        onMouseEnter: () => {
                          if (hoverClearTimerRef.current) {
                            clearTimeout(hoverClearTimerRef.current);
                            hoverClearTimerRef.current = null;
                          }
                          setHoveredEntry(d);
                        },
                        onMouseLeave: () => {
                          hoverClearTimerRef.current = setTimeout(
                            () => setHoveredEntry(null),
                            16,
                          );
                        },
                        onClick: () => onEntryClick(d),
                      };
                      return (
                        <g
                          key={d.id}
                          data-seg-idx={d.segmentIndex}
                          data-entry-id={d.id}
                          data-demo-kind="dot"
                          opacity={opacity}
                          style={{
                            cursor: "pointer",
                            transition: "opacity 120ms",
                          }}
                          {...handlers}
                        >
                          {renderEntryShape(d, r, fill, shapeMode)}
                        </g>
                      );
                    })}
                  </g>

                  {/* Baseline — split around the inner-ring gap so the donut hole
              stays open at the bottom center. */}
                  <line
                    data-relview-baseline
                    x1={CX - R_OUTER - 10}
                    y1={CY}
                    x2={CX - R_INNER}
                    y2={CY}
                    stroke="var(--color-ring-boundary)"
                    strokeWidth={1}
                  />
                  <line
                    data-relview-baseline
                    x1={CX + R_INNER}
                    y1={CY}
                    x2={CX + R_OUTER + 10}
                    y2={CY}
                    stroke="var(--color-ring-boundary)"
                    strokeWidth={1}
                  />
                </g>
              </g>
            </g>

            {/* Ring labels for the focused slice — sibling of focusG so they're
            placed in screen coords (no focus rotation re-applied). Labels sit
            slightly above the slice's top boundary, offset perpendicular to
            it, and are tilted parallel to that boundary. */}
            {focusGeom &&
              focusedSegmentIdx !== null &&
              (() => {
                const { focusScale, targetApexX, targetApexY, segHalfAngle } =
                  focusGeom;
                // In the focused view the slice's centerline points left and the top
                // boundary runs from the apex up-and-to-the-left at angle segHalfAngle
                // above horizontal. Boundary-tangent direction (apex → outer):
                // (-cos α, -sin α). Outward normal (away from slice): (sin α, -cos α).
                const cosA = Math.cos(segHalfAngle);
                const sinA = Math.sin(segHalfAngle);
                // Tilt text parallel to the boundary, right-side-up.
                const labelRotateDeg = segHalfAngle * (180 / Math.PI);
                // Standardize ring-label size across all segments. These labels
                // are siblings of focusG, so they only inherit rootG's zoom
                // (= fitZoom) and not focusG's segment-dependent focusScale —
                // which means a fixed fontSize-in-vb renders at noticeably
                // different CSS-px sizes between narrow and wide segments
                // (especially in taller wrappers, where wide segments become
                // x-limited and pick up a larger fitZoom). Dividing by zoom
                // keeps the on-screen size constant. Same trick for the gap
                // between the slice boundary and the label so the spacing
                // doesn't visually grow on wide segments either.
                const safeZoom = Math.max(0.4, zoom);
                const ringFontSize = 11 / safeZoom;
                const LABEL_GAP = 10 / safeZoom;
                return (
                  <g
                    ref={focusLabelsRef}
                    pointerEvents="none"
                    style={{ transition: "opacity 220ms ease" }}
                  >
                    {sortedRings.map((ring, ri) => {
                      const ringCenterR = R_INNER + (ri + 0.5) * bandStep;
                      const distFromApex = ringCenterR * focusScale;
                      const bx = targetApexX - distFromApex * cosA;
                      const by = targetApexY - distFromApex * sinA;
                      const x = bx + LABEL_GAP * sinA;
                      const y = by - LABEL_GAP * cosA;
                      return (
                        <text
                          key={`focus-ringlabel-${ring.id}`}
                          x={x}
                          y={y}
                          transform={`rotate(${labelRotateDeg}, ${x}, ${y})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={ringFontSize}
                          fontWeight="bold"
                          fill="var(--color-muted-text)"
                          fontFamily="var(--font-family)"
                          style={{ letterSpacing: "0.04em" }}
                        >
                          {ring.name}
                        </text>
                      );
                    })}
                  </g>
                );
              })()}

            {/* Focus-mode segment chrome — sibling of focusG so it lives in
            screen-aligned coords (no focus rotation re-applied) and inherits
            only rootG's fit transform. Contains: (1) the center logo just past
            the segment's apex (horizontal, on the slice mid-axis), (2) the
            period / cycle label on the Invest ring at the bottom of the slice,
            and (3) an export-only Nodus watermark sitting in the 5th-ring-
            label-slot equivalent on the TOP boundary — i.e. left of Monitor,
            aligned with the focus ring labels (opacity:0 on screen, revealed
            by prepareExportSvg). */}
            {focusGeom &&
              focusedSegmentIdx !== null &&
              (() => {
                const { focusScale, targetApexX, targetApexY, segHalfAngle } =
                  focusGeom;
                const cosA = Math.cos(segHalfAngle);
                const sinA = Math.sin(segHalfAngle);
                const safeZoom = Math.max(0.4, zoom);
                const investR = R_INNER + 0.5 * bandStep;
                // Counter-zoom CSS-px sizes so the on-screen size stays stable
                // across narrow/wide segments (the focus chrome is a sibling of
                // focusG so it inherits rootG's fit zoom — same trick the focus
                // ring labels above use).
                const PERP_GAP = 12 / safeZoom;
                const bottomRotateDeg = -segHalfAngle * (180 / Math.PI);
                const topRotateDeg = segHalfAngle * (180 / Math.PI);

                // Apex side of the slice — the segment "points" toward its tip
                // at (targetApexX, targetApexY). Anchor the logo's LEFT edge to
                // the Invest ring's inner radius (= R_INNER, the smaller of the
                // band's two radii): along the mid-axis that's the point where
                // the donut hole ends and Invest begins. The logo then extends
                // toward the apex, sitting in the donut-hole strip just inside
                // the slice rather than floating past the tip.
                const centerLogoLeftX = targetApexX - R_INNER * focusScale;
                const centerLogoY = targetApexY;

                // Point on the bottom boundary at radius r, offset perpendicular
                // to the boundary (away from the slice → further into +y).
                const bottomAt = (r: number) => {
                  const bx = targetApexX - focusScale * r * cosA;
                  const by = targetApexY + focusScale * r * sinA;
                  return {
                    x: bx + PERP_GAP * sinA,
                    y: by + PERP_GAP * cosA,
                  };
                };
                const investPos = bottomAt(investR);

                // Watermark slot — 5th-ring-label-slot equivalent on the TOP
                // boundary (ringIdx = N_RINGS = 4), offset outward by the same
                // LABEL_GAP the focus ring labels use so it aligns with them.
                const wmRingIdx = sortedRings.length;
                const wmR = R_INNER + (wmRingIdx + 0.5) * bandStep;
                const wmDistFromApex = wmR * focusScale;
                const wmBx = targetApexX - wmDistFromApex * cosA;
                const wmBy = targetApexY - wmDistFromApex * sinA;
                const wmLabelGap = 10 / safeZoom;
                const wmX = wmBx + wmLabelGap * sinA;
                const wmY = wmBy - wmLabelGap * cosA;

                return (
                  <g pointerEvents="none">
                    {/* Center logo just past the apex (LEFT edge anchored to
                  targetApexX + APEX_GAP so it doesn't crowd the slice tip). */}
                    {centerLogoUrl === "nodus"
                      ? (() => {
                          const markSize = 24 / safeZoom;
                          const fontSize = 14 / safeZoom;
                          const gap = 4 / safeZoom;
                          const markX = centerLogoLeftX;
                          const markY = centerLogoY - markSize / 2;
                          const textX = markX + markSize + gap;
                          return (
                            <g>
                              <image
                                href="/nodus_mark.svg"
                                x={markX}
                                y={markY}
                                width={markSize}
                                height={markSize}
                                preserveAspectRatio="xMidYMid meet"
                              />
                              <text
                                x={textX}
                                y={centerLogoY}
                                textAnchor="start"
                                dominantBaseline="middle"
                                fontFamily="system-ui, -apple-system, sans-serif"
                                fontSize={fontSize}
                                fontWeight={700}
                                fill="#161616"
                              >
                                Nodus
                              </text>
                            </g>
                          );
                        })()
                      : centerLogoUrl
                        ? (() => {
                            const logoW = 80 / safeZoom;
                            const logoH = 30 / safeZoom;
                            return (
                              <image
                                href={centerLogoUrl}
                                x={centerLogoLeftX}
                                y={centerLogoY - logoH / 2}
                                width={logoW}
                                height={logoH}
                                preserveAspectRatio="xMinYMid meet"
                              />
                            );
                          })()
                        : null}

                    {/* Period / cycle label on Invest ring bottom — tilted
                  parallel to the bottom boundary so it reads right-side-up. */}
                    {cycleLabel && (
                      <text
                        x={investPos.x}
                        y={investPos.y}
                        transform={`rotate(${bottomRotateDeg}, ${investPos.x}, ${investPos.y})`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontFamily="var(--font-family)"
                        fontSize={10 / safeZoom}
                        fontWeight={600}
                        fill={resolvedCycleLabelColor}
                        style={{ letterSpacing: "0.18em" }}
                      >
                        {cycleLabel}
                      </text>
                    )}

                    {/* Nodus watermark — opacity:0 on screen, revealed by
                  prepareExportSvg. Sits in the 5th-ring-label-slot equivalent
                  on the TOP boundary (left of Monitor, aligned with the focus
                  ring labels). Skipped when the center logo is already Nodus
                  so the export doesn't carry two Nodus stamps. */}
                    {centerLogoUrl !== "nodus" &&
                      (() => {
                        const markSize = 16 / safeZoom;
                        const fontSize = 8 / safeZoom;
                        const gap = 4 / safeZoom;
                        const approxTextWidth =
                          fontSize * 0.55 * "Nodus".length;
                        const totalWidth = markSize + gap + approxTextWidth;
                        return (
                          <g
                            data-focus-watermark="nodus"
                            opacity="0"
                            transform={`translate(${wmX}, ${wmY}) rotate(${topRotateDeg})`}
                          >
                            <image
                              href="/nodus_mark.svg"
                              x={-totalWidth / 2}
                              y={-markSize / 2}
                              width={markSize}
                              height={markSize}
                              preserveAspectRatio="xMidYMid meet"
                            />
                            <text
                              x={-totalWidth / 2 + markSize + gap}
                              y={0}
                              textAnchor="start"
                              dominantBaseline="middle"
                              fontFamily="system-ui, -apple-system, sans-serif"
                              fontSize={fontSize}
                              fontWeight={700}
                              fill="#161616"
                            >
                              Nodus
                            </text>
                          </g>
                        );
                      })()}
                  </g>
                );
              })()}

            {/* Cross-segment relation labels and bezier curves. Sibling of
            focusG so labels render in screen-aligned coords (no focus rotation
            applied). The bezier source uses applyFocusTransform to land at the
            on-screen position of the in-slice dot — keeping the start anchored
            to the visible dot even though the curve is outside focusG. */}
            {focusGeom &&
              focusedSegmentIdx !== null &&
              activeEntry &&
              crossSegmentLabelLayout &&
              (() => {
                const layout = crossSegmentLabelLayout;
                const activeDot = positionById.get(activeEntry.topic_id);
                if (!activeDot) return null;
                const { focusScale, targetApexX, targetApexY, rotateRad } =
                  focusGeom;
                const sourceScreen = applyFocusTransform(
                  activeDot.arcX,
                  activeDot.arcY,
                  focusScale,
                  rotateRad,
                  targetApexX,
                  targetApexY,
                );
                return (
                  <g pointerEvents="none">
                    {/* Bezier per box. The end-tangent control sits directly
                  along the vertical away from the box edge so the arrow tip
                  approaches perpendicular to the slice-facing edge. */}
                    <g>
                      {layout.groups.map((group) => {
                        const cpFraction = 0.42;
                        const c1x =
                          sourceScreen.x +
                          (targetApexX - sourceScreen.x) * cpFraction;
                        const c1y =
                          sourceScreen.y +
                          (targetApexY - sourceScreen.y) * cpFraction;
                        const TANGENT_PULL = 26;
                        const c2x = group.arrowTarget.x;
                        const c2y =
                          group.side === "above"
                            ? group.arrowTarget.y + TANGENT_PULL
                            : group.arrowTarget.y - TANGENT_PULL;
                        return (
                          <path
                            key={`xseg-${group.segmentIndex}`}
                            d={`M ${sourceScreen.x} ${sourceScreen.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${group.arrowTarget.x} ${group.arrowTarget.y}`}
                            fill="none"
                            stroke={group.arrowStrokeColor}
                            strokeWidth={1.0}
                            strokeOpacity={0.7}
                            strokeDasharray={group.arrowDash}
                            markerEnd="url(#radarview-rel-arrow)"
                          />
                        );
                      })}
                    </g>
                    {/* Bordered boxes with left-aligned title + topic rows. */}
                    <g>
                      {layout.groups.map((group) => (
                        <g key={`xseg-grp-${group.segmentIndex}`}>
                          <rect
                            x={group.x}
                            y={group.y}
                            width={group.width}
                            height={group.height}
                            rx={4}
                            ry={4}
                            fill="var(--color-card-background, #ffffff)"
                            fillOpacity={0.95}
                            stroke={group.themeColor}
                            strokeWidth={1.2}
                          />
                          <text
                            x={group.header.x}
                            y={group.header.y}
                            textAnchor="start"
                            dominantBaseline="middle"
                            fontSize={9}
                            fontWeight="bold"
                            fill={group.themeColor}
                            fontFamily="var(--font-family)"
                            style={{ letterSpacing: "0.04em" }}
                          >
                            {group.segmentName.toUpperCase()}
                          </text>
                          {group.rows.map((row) => (
                            <text
                              key={`xseg-row-${row.topicId}`}
                              x={row.x}
                              y={row.y}
                              textAnchor="start"
                              dominantBaseline="middle"
                              fontSize={8}
                              fill="var(--color-dark-text)"
                              fontFamily="var(--font-family)"
                            >
                              {`•  ${row.name}`}
                            </text>
                          ))}
                        </g>
                      ))}
                    </g>
                  </g>
                );
              })()}

            {/* Center logo — sits in the donut hole, anchored bottom-center so
            it never crosses R_INNER. Sibling of focusG so it pans/zooms with
            the chart but isn't rotated by focus mode; fades out during focus. */}
            {cycleLabel ? (
              <text
                x={CX}
                y={CY - 29}
                textAnchor="middle"
                dominantBaseline="alphabetic"
                fontFamily="var(--font-family)"
                fontSize={10}
                fontWeight={600}
                fill={resolvedCycleLabelColor}
                pointerEvents="none"
                style={{
                  opacity: focusModeActive ? 0 : 1,
                  transition: "opacity 220ms ease",
                  letterSpacing: "0.18em",
                }}
              >
                {cycleLabel}
              </text>
            ) : null}
            {centerLogoUrl === "nodus" ? (
              (() => {
                // Bundled "Nodus mark + Nodus wordmark" default. Marked with
                // data-center-logo="nodus" so the export pipeline can suppress
                // the corner watermark and avoid a duplicate Nodus logo.
                const markSize = 24;
                const fontSize = 14;
                const gap = 4;
                const approxTextWidth = fontSize * 0.55 * "Nodus".length;
                const totalWidth = markSize + gap + approxTextWidth;
                const baselineY = CY - 6;
                const markX = CX - totalWidth / 2;
                const markY = baselineY - fontSize * 0.35 - markSize / 2;
                const textX = markX + markSize + gap + approxTextWidth / 2;
                return (
                  <g
                    data-center-logo="nodus"
                    pointerEvents="none"
                    style={{
                      opacity: focusModeActive ? 0 : 1,
                      transition: "opacity 220ms ease",
                    }}
                  >
                    <image
                      href="/nodus_mark.svg"
                      x={markX}
                      y={markY}
                      width={markSize}
                      height={markSize}
                      preserveAspectRatio="xMidYMid meet"
                    />
                    <text
                      x={textX}
                      y={baselineY}
                      textAnchor="middle"
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontSize={fontSize}
                      fontWeight={700}
                      fill="#161616"
                    >
                      Nodus
                    </text>
                  </g>
                );
              })()
            ) : centerLogoUrl ? (
              <image
                href={centerLogoUrl}
                x={CX - 40}
                y={CY - 32}
                width={80}
                height={30}
                preserveAspectRatio="xMidYMax meet"
                pointerEvents="none"
                style={{
                  opacity: focusModeActive ? 0 : 1,
                  transition: "opacity 220ms ease",
                }}
              />
            ) : null}
          </g>
        </svg>
        {/* Top-left overlay — holds the foldable legend and (when a segment is
          focused) the focus-exit pill. Rendered as a flex column so the pill
          always sits directly below the legend regardless of how the legend
          resizes with filter / colorMode / shapeMode changes. */}
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-start",
            fontFamily: "var(--font-family)",
          }}
        >
          <div
            style={{
              background: "var(--color-card-background, #fff)",
              border: "1px solid var(--color-ring-boundary, #ddd)",
              borderRadius: 6,
              overflow: "hidden",
              fontFamily: "var(--font-family)",
              fontSize: 11,
              minWidth: 140,
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
            }}
          >
            <button
              onClick={() => setLegendOpen((o) => !o)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                fontFamily: "var(--font-family)",
                fontSize: 11,
                fontWeight: "bold",
                color: "var(--color-dark-text)",
              }}
            >
              <span>Legend</span>
              <span style={{ marginLeft: 8, fontSize: 9 }}>
                {legendOpen ? "▲" : "▼"}
              </span>
            </button>
            {legendOpen && (
              <div style={{ padding: "2px 10px 8px" }}>
                <div
                  style={{
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--color-muted-text)",
                    marginTop: 4,
                  }}
                >
                  Dot color
                </div>
                {colorKey.map((k) => (
                  <div
                    key={k.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: k.color,
                        border: "1px solid rgba(0,0,0,0.08)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "var(--color-muted-text)" }}>
                      {k.label}
                    </span>
                  </div>
                ))}

                {shapeMode === "movement" && (
                  <>
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 6,
                        borderTop: "1px dashed var(--color-ring-boundary)",
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--color-muted-text)",
                      }}
                    >
                      Shape
                    </div>
                    {[
                      { kind: "circle", label: "Unchanged" },
                      { kind: "star", label: "New" },
                      { kind: "arrow-in", label: "Promoted (inward)" },
                      { kind: "arrow-out", label: "Demoted (outward)" },
                    ].map((row) => (
                      <div
                        key={row.kind}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 4,
                        }}
                      >
                        <svg width={18} height={14} viewBox="-9 -7 18 14">
                          {row.kind === "circle" && (
                            <circle
                              cx={0}
                              cy={0}
                              r={4}
                              fill="var(--color-muted-text)"
                              stroke="white"
                              strokeWidth={1}
                            />
                          )}
                          {row.kind === "star" && (
                            <polygon
                              points={starPolygonPoints(5)}
                              fill="var(--color-muted-text)"
                              stroke="white"
                              strokeWidth={0.8}
                            />
                          )}
                          {row.kind === "arrow-in" && (
                            <polygon
                              points={arrowPolygonPoints(4)}
                              fill="var(--color-muted-text)"
                              stroke="white"
                              strokeWidth={0.8}
                              transform="rotate(180)"
                            />
                          )}
                          {row.kind === "arrow-out" && (
                            <polygon
                              points={arrowPolygonPoints(4)}
                              fill="var(--color-muted-text)"
                              stroke="white"
                              strokeWidth={0.8}
                            />
                          )}
                        </svg>
                        <span style={{ color: "var(--color-muted-text)" }}>
                          {row.label}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 6,
                    borderTop: "1px dashed var(--color-ring-boundary)",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--color-muted-text)",
                  }}
                >
                  Relations
                </div>
                {Object.entries(RELATION_STROKES).map(([type, s]) => (
                  <div
                    key={type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <svg width={24} height={14}>
                      <line
                        x1={0}
                        y1={7}
                        x2={24}
                        y2={7}
                        stroke={s.color}
                        strokeWidth={1.5}
                        strokeDasharray={s.dash}
                      />
                    </svg>
                    <span style={{ color: "var(--color-muted-text)" }}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {focusedSegmentIdx !== null && onFocusExit && (
            <button
              type="button"
              onClick={onFocusExit}
              aria-label="Back to full radar view"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-4)",
                background: "rgba(255,255,255,0.88)",
                backdropFilter: "blur(4px)",
                border: "1px solid var(--color-ring-boundary)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-md)",
                cursor: "pointer",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-dark-blue)",
              }}
            >
              ← All segments
            </button>
          )}
        </div>{" "}
        {/* end top-left overlay */}
      </div>{" "}
      {/* end SVG container */}
    </div>
  );
}
