/**
 * SVG renderer for both tree modes and both layout shapes.
 *
 * The renderer knows nothing about hierarchy: it draws a `TreeLayout`, whose
 * nodes carry plain coordinates and whose links carry finished path strings.
 * That is what lets the columnar and radial layouts share every behaviour
 * around them — pan, zoom, fit, selection, the detail panel.
 *
 * The column caption rail is HTML positioned outside the zoom group, not
 * `<text>` inside it: captions must stay pinned and legible while a tall
 * column is panned, and in-SVG text at minimum zoom is unreadable. It tracks
 * the canvas by projecting each column's x through the same zoom/translate
 * state that drives the group transform. Ring captions have no such problem —
 * they sit on the rings themselves and scale with them.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from "react";
import { RELATION_STROKES } from "../radar/encodings";
import { themeByKey, type SegmentTheme } from "../radar/segmentThemes";
import type { RadarData } from "../radar/types";
import {
  COLUMN_W,
  RING_STEP,
  type PositionedNode,
  type TreeLayout,
} from "./layout";
import { NODE_MARKS, columnAccent, groupDepthColor } from "./treeEncodings";
import { usePanZoom, type TreeViewControls } from "./usePanZoom";

type Props = {
  layout: TreeLayout;
  data: RadarData;
  selectedTopicId: string | null;
  anchorTopicId: string | null;
  onSelect: (node: PositionedNode) => void;
  onAnchor: (node: PositionedNode) => void;
  onFocus: (node: PositionedNode) => void;
  onToggleBranch: (node: PositionedNode) => void;
  /** Arms the canvas so the next plain click focuses instead of selecting. */
  picking?: boolean;
  onPickingChange?: (picking: boolean) => void;
  onZoomChange?: (zoom: number, fitZoom: number) => void;
  controlsRef?: Ref<TreeViewControls | null>;
  /** Handed out so the page can publish this canvas to the export menu. */
  svgRef?: Ref<SVGSVGElement | null>;
};

/** How long a single click waits to see whether it is really a double click. */
const DOUBLE_CLICK_GRACE_MS = 220;

/**
 * How long a press has to be held before it counts as "focus on this".
 *
 * Alt-click is the fast route but it is invisible and needs a keyboard. A held
 * press is neither: it is the gesture a touch user already reaches for, and it
 * is the same gesture with a mouse.
 */
const LONG_PRESS_MS = 500;

/** Movement that turns a held press back into a drag of the canvas. */
const LONG_PRESS_SLOP_PX = 6;

const STROKE_BY_KIND = {
  drives: RELATION_STROKES.drives,
  hinders: RELATION_STROKES.hinders,
  relates: RELATION_STROKES.relates_to,
};

/** Keep a caption inside its column so neighbouring labels cannot collide. */
const MAX_LABEL_CHARS = 26;

/** Half-width of a node's clickable area, sized to cover a truncated caption. */
const HIT_HALF_W = 95;

/** Length of the clickable strip that follows a radial caption outwards. */
const RADIAL_HIT_W = 170;

/** Below this zoom a leaf caption is unreadable texture, so it is dropped. */
const LEAF_LABEL_MIN_ZOOM = 0.45;

const CANVAS_CSS = `
.tree-node { cursor: pointer; }
.tree-node__mark {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 120ms ease;
}
/* Chrome paints its 5px UA outline on a focusable SVG group for plain :focus,
   not :focus-visible, so a click leaves a slab around the node. Suppress that
   and put a real indicator back for keyboard focus only. */
.tree-node:focus { outline: none; }
.tree-node:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: no-preference) {
  .tree-node:hover .tree-node__mark,
  .tree-node:focus-visible .tree-node__mark { transform: scale(1.2); }
  .tree-node, .tree-link { transition: opacity 160ms ease; }
}
[data-emphasis="dim"] { opacity: 0.18; }
svg[data-zoom-band="far"] .tree-node[data-kind="technology"] .tree-node__label {
  display: none;
}
`;

function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_CHARS
    ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…`
    : name;
}

/**
 * Opaque ground for the composited pan/zoom layer.
 *
 * Padded far past the content so the layer stays covered at any pan offset the
 * fit clamp allows; it is excluded from fit-to-content by living outside the
 * measured group.
 */
function backdropBox(layout: TreeLayout) {
  const xs = layout.nodes.map((n) => n.x);
  const ys = layout.nodes.map((n) => n.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  const pad = COLUMN_W * 12;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

function nodeTheme(node: PositionedNode, data: RadarData): SegmentTheme {
  const segment = data.segments.find((s) => s.id === node.entry?.segment_id);
  return themeByKey(segment?.theme_key);
}

/**
 * Selected node, its immediate neighbours, and everything else.
 *
 * Returning `null` when nothing is selected keeps the whole graph at full
 * strength rather than paying for a map on every render.
 */
function emphasisFor(
  layout: TreeLayout,
  selectedTopicId: string | null,
): { near: Set<string>; links: Set<string> } | null {
  if (!selectedTopicId) return null;
  if (!layout.nodes.some((n) => n.topicId === selectedTopicId)) return null;
  const near = new Set<string>([selectedTopicId]);
  const links = new Set<string>();
  for (const edge of layout.links) {
    if (edge.from !== selectedTopicId && edge.to !== selectedTopicId) continue;
    near.add(edge.from);
    near.add(edge.to);
    links.add(`${edge.from}-${edge.to}-${edge.kind}`);
  }
  return { near, links };
}

export function TreeView({
  layout,
  data,
  selectedTopicId,
  anchorTopicId,
  onSelect,
  onAnchor,
  onFocus,
  onToggleBranch,
  picking = false,
  onPickingChange,
  onZoomChange,
  controlsRef,
  svgRef,
}: Props) {
  const fitKey = `${layout.shape}:${layout.nodes.length}:${layout.width}:${layout.height}:${layout.columns.length}`;
  const {
    wrapperRef,
    rootGRef,
    contentGRef,
    zoom,
    translate,
    isDragging,
    controls,
  } = usePanZoom({ fitKey, onZoomChange });
  const backdrop = backdropBox(layout);
  const emphasis = useMemo(
    () => emphasisFor(layout, selectedTopicId),
    [layout, selectedTopicId],
  );

  useImperativeHandle(controlsRef, () => controls, [controls]);

  // Selecting opens a panel with a full-screen overlay, which would swallow the
  // second half of a double-click and make re-anchoring impossible. Hold the
  // single-click action back long enough to see whether a double-click follows.
  const clickTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    },
    [],
  );

  // A press that has already focused must not also select on release.
  const longPressFired = useRef(false);

  const focusNow = useCallback(
    (node: PositionedNode) => {
      // Focusing is immediate: it has no double-click counterpart to wait for,
      // and holding it back would make the gesture feel broken.
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      onFocus(node);
      onPickingChange?.(false);
    },
    [onFocus, onPickingChange],
  );

  const handleClick = useCallback(
    (node: PositionedNode, altKey: boolean) => {
      if (longPressFired.current) {
        longPressFired.current = false;
        return;
      }
      if (altKey || picking) {
        focusNow(node);
        return;
      }
      if (clickTimer.current !== null) return;
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = null;
        onSelect(node);
      }, DOUBLE_CLICK_GRACE_MS);
    },
    [onSelect, focusNow, picking],
  );

  const handleLongPress = useCallback(
    (node: PositionedNode) => {
      longPressFired.current = true;
      focusNow(node);
    },
    [focusNow],
  );

  const handlePressStart = useCallback(() => {
    longPressFired.current = false;
  }, []);

  // Escape leaves pick mode. Bound while armed only, so it never competes with
  // whatever else the page wants Escape for.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPickingChange?.(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, onPickingChange]);

  const handleDoubleClick = useCallback(
    (node: PositionedNode) => {
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      onAnchor(node);
    },
    [onAnchor],
  );

  // Lanes run the full height of the opaque layer, not just the content's own
  // extent: a lane that stops where the deepest node stops reads as a floating
  // white block rather than as a column the tree is standing in.
  const laneTop = backdrop.y;
  const laneBottom = backdrop.y + backdrop.height;

  return (
    <div
      ref={wrapperRef}
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "var(--color-page-background)",
        cursor: isDragging ? "grabbing" : picking ? "crosshair" : "default",
      }}
    >
      {picking && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: 38,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "6px 8px 6px 12px",
            borderRadius: 999,
            background: "var(--color-brand-dark-blue)",
            color: "var(--color-white)",
            fontFamily: "var(--font-family)",
            fontSize: "var(--font-size-xs)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          Click a node to focus the tree on it
          <button
            type="button"
            onClick={() => onPickingChange?.(false)}
            style={{
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: 999,
              background: "transparent",
              color: "inherit",
              font: "inherit",
              padding: "1px 8px",
              cursor: "pointer",
            }}
          >
            Esc
          </button>
        </div>
      )}
      <svg
        ref={svgRef as Ref<SVGSVGElement>}
        width="100%"
        height="100%"
        style={{ display: "block", overflow: "hidden" }}
        aria-label="Technology tree"
        role="img"
        data-zoom-band={zoom < LEAF_LABEL_MIN_ZOOM ? "far" : "near"}
      >
        <style>{CANVAS_CSS}</style>
        <defs>
          {Object.entries(STROKE_BY_KIND).map(([kind, stroke]) => (
            <marker
              key={kind}
              id={`tree-arrow-${kind}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke.color} />
            </marker>
          ))}
        </defs>

        <g ref={rootGRef} data-tree-root>
          {/* The transformed group is its own compositor layer (see
              `usePanZoom`). A transparent layer lets Chrome leave the previous
              frame's text behind while panning, so the layer gets an opaque
              ground of its own rather than borrowing the wrapper's. */}
          <rect
            x={backdrop.x}
            y={backdrop.y}
            width={backdrop.width}
            height={backdrop.height}
            fill="var(--color-page-background)"
          />

          {/* Column lanes are deliberately taller than the content, so they
              sit outside the measured group — fit-to-content would otherwise
              zoom out to frame the lanes rather than the tree. */}
          {layout.shape === "columns" && (
            <g>
              {layout.columns.map((column, index) => (
                <rect
                  key={`lane-${column.level}`}
                  x={column.x - COLUMN_W / 2}
                  y={laneTop}
                  width={COLUMN_W}
                  height={laneBottom - laneTop}
                  // The caption rail is HTML outside the SVG, so a serialised
                  // export loses it. Carrying the caption on the lane lets
                  // `prepareTreeExportSvg` rebuild the row in-SVG without a
                  // hidden duplicate sitting in the live DOM.
                  data-column-label={column.label}
                  data-column-accent={columnAccent(
                    column.level,
                    layout.linkPalette,
                  )}
                  fill={
                    layout.linkPalette === "relation" && column.level === 0
                      ? "color-mix(in srgb, var(--color-brand-orange) 7%, var(--color-white))"
                      : index % 2 === 0
                        ? "var(--color-white)"
                        : "var(--color-page-background)"
                  }
                />
              ))}
              {layout.columns.map((column) => (
                <line
                  key={`sep-${column.level}`}
                  x1={column.x + COLUMN_W / 2}
                  x2={column.x + COLUMN_W / 2}
                  y1={laneTop}
                  y2={laneBottom}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
              ))}
            </g>
          )}

          <g ref={contentGRef} data-tree-content>
            {/* Ring bands are content-sized, so unlike the lanes they belong
                inside the measured group: the outermost band and its caption
                have to survive fit-to-content. Boundaries fall halfway between
                two rings, which centres each generation in its own band. */}
            {layout.shape === "radial" && (
              <g>
                {[...layout.rings].reverse().map((ring, index) => (
                  <circle
                    key={`band-${ring.level}`}
                    r={ring.radius + RING_STEP / 2}
                    fill={
                      index % 2 === 0
                        ? "var(--color-white)"
                        : "var(--color-page-background)"
                    }
                    stroke="var(--color-border)"
                    strokeWidth={1}
                  />
                ))}
                {layout.rings.map((ring) => (
                  <text
                    key={`ring-label-${ring.level}`}
                    x={0}
                    y={-ring.radius - RING_STEP / 2 + 16}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight="var(--font-weight-bold)"
                    letterSpacing="0.08em"
                    fill="var(--color-muted-text)"
                    paintOrder="stroke"
                    stroke="var(--color-white)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                  >
                    {ring.label}
                  </text>
                ))}
              </g>
            )}

            <g>
              {layout.links.map((edge) => {
                const key = `${edge.from}-${edge.to}-${edge.kind}`;
                const stroke = STROKE_BY_KIND[edge.kind];
                const depthTint = `color-mix(in srgb, ${groupDepthColor(
                  Math.abs(edge.sourceLevel),
                )} 55%, var(--color-white))`;
                // A forward link always steps exactly one generation in the
                // direction the layout already reads, so an arrowhead on it is
                // 300 repetitions of what the columns say. Back edges are the
                // only ambiguous ones, and they are the ones that get a marker.
                const dash = edge.back
                  ? edge.kind === "hinders"
                    ? stroke.dash
                    : "1,5"
                  : stroke.dash;
                return (
                  <path
                    key={key}
                    className="tree-link"
                    d={edge.path}
                    fill="none"
                    stroke={
                      layout.linkPalette === "depth" ? depthTint : stroke.color
                    }
                    strokeWidth={
                      edge.back
                        ? 1.25
                        : edge.targetKind === "technology"
                          ? 1.25
                          : 2
                    }
                    strokeDasharray={dash}
                    strokeLinecap={edge.back ? "round" : undefined}
                    strokeOpacity={
                      edge.back
                        ? 0.55
                        : layout.linkPalette === "depth"
                          ? 1
                          : 0.75
                    }
                    markerEnd={
                      edge.back ? `url(#tree-arrow-${edge.kind})` : undefined
                    }
                    data-emphasis={
                      emphasis
                        ? emphasis.links.has(key)
                          ? "near"
                          : "dim"
                        : undefined
                    }
                  />
                );
              })}
            </g>

            <g>
              {layout.nodes.map((node) => (
                <TreeNodeMark
                  key={node.topicId}
                  node={node}
                  theme={nodeTheme(node, data)}
                  selected={node.topicId === selectedTopicId}
                  anchored={node.topicId === anchorTopicId}
                  emphasis={
                    emphasis
                      ? emphasis.near.has(node.topicId)
                        ? "near"
                        : "dim"
                      : undefined
                  }
                  onSelect={handleClick}
                  onAnchor={handleDoubleClick}
                  onLongPress={handleLongPress}
                  onPressStart={handlePressStart}
                  onToggleBranch={onToggleBranch}
                  showDisclosure={layout.shape === "columns"}
                />
              ))}
            </g>
          </g>
        </g>
      </svg>

      {layout.shape === "columns" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 30,
            pointerEvents: "none",
            overflow: "hidden",
            background: "var(--color-white)",
            borderBottom: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {layout.columns.map((column) => (
            <div
              key={column.level}
              style={{
                position: "absolute",
                left: translate.x + zoom * column.x,
                top: 6,
                width: Math.max(48, zoom * COLUMN_W - 8),
                transform: "translateX(-50%)",
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontSize: "11px",
                fontWeight: "var(--font-weight-bold)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-muted-text)",
                fontFamily: "var(--font-family)",
                paddingBottom: 5,
                borderBottom: `2px solid ${columnAccent(
                  column.level,
                  layout.linkPalette,
                )}`,
              }}
            >
              {column.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNodeMark({
  node,
  theme,
  selected,
  anchored,
  emphasis,
  onSelect,
  onAnchor,
  onLongPress,
  onPressStart,
  onToggleBranch,
  showDisclosure,
}: {
  node: PositionedNode;
  theme: SegmentTheme;
  selected: boolean;
  anchored: boolean;
  emphasis?: "near" | "dim";
  onSelect: (node: PositionedNode, altKey: boolean) => void;
  onAnchor: (node: PositionedNode) => void;
  onLongPress: (node: PositionedNode) => void;
  onPressStart: () => void;
  onToggleBranch: (node: PositionedNode) => void;
  /** Radial nodes have no consistent "left", so the control is columns-only. */
  showDisclosure: boolean;
}) {
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const cancelPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressOrigin.current = null;
  }, []);
  useEffect(() => cancelPress, [cancelPress]);
  const mark = NODE_MARKS[node.kind];
  const accent = groupDepthColor(Math.abs(node.level));
  const outer = mark.outerRadius ?? mark.radius;
  const radial = node.angle !== undefined;
  const flip = radial && node.angle! > Math.PI;
  // Only leaves get a caption rotated onto their own radius. A parent labelled
  // that way runs its text straight through the children it points at, and a
  // root labelled inwards collides with every other root at the centre — so
  // parents keep a horizontal caption, set just outside their mark.
  const radialLeaf = radial && node.kind === "technology";
  const outwardX = radial ? Math.sin(node.angle!) : 0;
  const outwardY = radial ? -Math.cos(node.angle!) : 0;
  // A centred caption straddles the mark it is meant to sit beside. Anchor it
  // to whichever end the radius points at, and only centre it where the radius
  // is near vertical and the offset alone clears the mark.
  const parentAnchor =
    outwardX > 0.35 ? "start" : outwardX < -0.35 ? "end" : "middle";

  const label = (
    <text
      className="tree-node__label"
      x={0}
      y={radial ? 0 : outer + 16}
      textAnchor={
        radialLeaf ? (flip ? "end" : "start") : radial ? parentAnchor : "middle"
      }
      dominantBaseline={radial ? "middle" : undefined}
      fontSize={node.kind === "technology" ? 12 : 12.5}
      fontWeight={
        mark.bold ? "var(--font-weight-bold)" : "var(--font-weight-regular)"
      }
      fill={
        node.kind === "labelGroup"
          ? "var(--color-muted-text)"
          : "var(--color-dark-text)"
      }
      // A cheap fill/stroke reorder rather than a filter: the caption keeps its
      // own ground where a link passes beneath it, at no compositing cost.
      paintOrder="stroke"
      stroke="var(--color-white)"
      strokeWidth={3}
      strokeLinejoin="round"
      style={{
        textTransform: node.kind === "labelGroup" ? "uppercase" : "none",
        letterSpacing: node.kind === "labelGroup" ? "0.04em" : "normal",
      }}
    >
      <title>{node.name}</title>
      {truncateLabel(node.name)}
    </text>
  );

  return (
    <g
      className="tree-node"
      data-topic-id={node.topicId}
      data-kind={node.kind}
      data-emphasis={emphasis}
      transform={`translate(${node.x}, ${node.y})`}
      opacity={node.connector ? 0.45 : 1}
      tabIndex={0}
      role="button"
      aria-label={node.name}
      onClick={(e) => onSelect(node, e.altKey)}
      onDoubleClick={() => onAnchor(node)}
      // A held press focuses. It is cancelled by movement so the same gesture
      // still starts a pan when the reader meant to drag the canvas.
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        // Touch does not always follow a long press with a click, so the flag
        // can outlive the gesture that set it and swallow the next tap.
        onPressStart();
        pressOrigin.current = { x: e.clientX, y: e.clientY };
        pressTimer.current = window.setTimeout(() => {
          pressTimer.current = null;
          onLongPress(node);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const from = pressOrigin.current;
        if (!from) return;
        if (
          Math.hypot(e.clientX - from.x, e.clientY - from.y) >
          LONG_PRESS_SLOP_PX
        ) {
          cancelPress();
        }
      }}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node, e.altKey);
        }
      }}
    >
      {/* A <g> has no geometry of its own, so the gap between the mark and the
          caption is not hit-testable. These invisible targets make the whole
          node — mark, gap and label — behave as one control. */}
      <circle r={outer + 8} fill="transparent" pointerEvents="all" />
      {!radial && (
        <rect
          x={-HIT_HALF_W}
          y={-outer - 4}
          width={HIT_HALF_W * 2}
          height={outer + 28}
          fill="transparent"
          pointerEvents="all"
        />
      )}

      {/* Folding used to be what a click on a label group did, which left a
          family's own profile with nowhere to open. Folding gets its own
          control instead — and technology groups, which could never be folded
          at all, get one for the first time. */}
      {showDisclosure && node.hasChildren && (
        <g
          className="tree-node__disclosure"
          transform={`translate(${-(outer + 15)}, 0)`}
          role="button"
          tabIndex={-1}
          aria-label={`${node.collapsed ? "Unfold" : "Fold"} ${node.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBranch(node);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <title>{node.collapsed ? "Unfold branch" : "Fold branch"}</title>
          <circle
            r={8}
            fill="var(--color-white)"
            stroke={accent}
            strokeWidth={1.5}
          />
          <line
            x1={-3.5}
            x2={3.5}
            y1={0}
            y2={0}
            stroke={accent}
            strokeWidth={1.75}
            strokeLinecap="round"
          />
          {node.collapsed && (
            <line
              x1={0}
              x2={0}
              y1={-3.5}
              y2={3.5}
              stroke={accent}
              strokeWidth={1.75}
              strokeLinecap="round"
            />
          )}
        </g>
      )}

      {anchored && (
        <>
          <circle
            r={mark.radius + 11}
            fill="var(--color-brand-orange)"
            fillOpacity={0.14}
          />
          <circle
            r={mark.radius + 7}
            fill="none"
            stroke="var(--color-brand-orange)"
            strokeWidth={2}
          />
        </>
      )}
      {selected && !anchored && (
        <>
          <circle
            r={mark.radius + 9}
            fill="var(--color-brand-bright-blue)"
            fillOpacity={0.14}
          />
          <circle
            r={mark.radius + 5}
            fill="none"
            stroke="var(--color-brand-bright-blue)"
            strokeWidth={2}
          />
        </>
      )}

      <g className="tree-node__mark">
        {mark.outerRadius !== null && (
          <circle
            r={mark.outerRadius}
            fill="none"
            stroke={accent}
            strokeWidth={1.5}
            // A broken ring reads as "there is more of this than you can see",
            // which is exactly what a collapsed parent is.
            strokeDasharray={node.collapsed ? "2,2" : undefined}
          />
        )}

        {mark.square ? (
          <rect
            x={-mark.radius}
            y={-mark.radius}
            width={mark.radius * 2}
            height={mark.radius * 2}
            rx={2}
            fill={`color-mix(in srgb, ${accent} 12%, var(--color-white))`}
            stroke={accent}
            strokeWidth={1.5}
            strokeDasharray="3,2"
          />
        ) : (
          <>
            {/* Separates the dot from any link running beneath it. */}
            <circle r={mark.radius + 2.5} fill="var(--color-white)" />
            <circle
              r={mark.radius}
              fill={node.entry ? theme.dot : "transparent"}
              // The darker tone of the same segment theme, so the contour
              // extends the segment encoding rather than adding one — and gold
              // stops disappearing into the ground.
              stroke={theme.labelText}
              strokeWidth={1}
            />
          </>
        )}

        {node.collapsed && mark.square && (
          <g stroke={accent} strokeWidth={1.5} strokeLinecap="round">
            <line x1={-3.5} x2={3.5} y1={0} y2={0} />
            <line x1={0} x2={0} y1={-3.5} y2={3.5} />
          </g>
        )}
      </g>

      {radialLeaf ? (
        <g
          transform={`rotate(${(node.angle! * 180) / Math.PI - 90}) translate(${
            outer + 9
          },0)${flip ? " rotate(180)" : ""}`}
        >
          <rect
            x={flip ? -RADIAL_HIT_W : 0}
            y={-11}
            width={RADIAL_HIT_W}
            height={22}
            fill="transparent"
            pointerEvents="all"
          />
          {label}
        </g>
      ) : radial ? (
        <g
          transform={`translate(${outwardX * (outer + 16)}, ${
            outwardY * (outer + 16)
          })`}
        >
          <rect
            x={
              parentAnchor === "start"
                ? 0
                : parentAnchor === "end"
                  ? -HIT_HALF_W * 2
                  : -HIT_HALF_W
            }
            y={-11}
            width={HIT_HALF_W * 2}
            height={22}
            fill="transparent"
            pointerEvents="all"
          />
          {label}
        </g>
      ) : (
        label
      )}
    </g>
  );
}
