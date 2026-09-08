/**
 * Diagrams for the guide and the help panel.
 *
 * These are drawn rather than screenshotted on purpose: a screenshot of the
 * radar goes stale the moment a segment is renamed, and a bitmap can't take
 * the reader's palette with it. Each figure is inline SVG painted from the
 * brand tokens, so it stays crisp at any zoom and follows the theme.
 *
 * They are written into markdown as an image with a `figure:` source —
 * `![Caption](figure:scouting-cycle)` — which `HelpMarkdown` intercepts. That
 * keeps the content files plain markdown: the alt text is the caption, and an
 * unknown name costs a picture rather than the page.
 */

import type { ReactElement, ReactNode } from "react";
import { groupDepthColor } from "../tree/treeEncodings";

const INK = "var(--color-brand-dark-blue)";
const ACCENT = "var(--color-brand-orange)";
const SOFT = "var(--color-brand-light-blue)";
const WASH = "var(--color-brand-near-white)";
const MUTED = "var(--color-muted-text)";
const PAPER = "var(--color-white)";

/** Read from the tree's own ramp, so the figures can't drift from the canvas. */
const LEVEL = [0, 1, 2].map(groupDepthColor);

/** Segment hues, matching `--color-segment-*`. */
const SEGMENT = ["#003584", "#0d9488", "#be185d", "#7c3aed", "#b45309"];

/** Rings from the centre outwards, as the methodology orders them. */
const RINGS = [
  { name: "INVEST", color: "var(--color-ring-invest)" },
  { name: "PILOT", color: "var(--color-ring-pilot)" },
  { name: "EXPLORE", color: "var(--color-ring-explore)" },
  { name: "MONITOR", color: "var(--color-ring-monitor)" },
];

/** Shared style for the small capitals that name a part of a figure. */
const caps = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.09em",
  fill: MUTED,
} as const;

/**
 * Wraps a figure in a titled, responsive SVG.
 *
 * `width: 100%` over a viewBox means one drawing fills the guide's 760px
 * column and shrinks into the 440px help panel with no breakpoints of its own.
 */
function Frame({
  viewBox,
  title,
  maxWidth,
  children,
}: {
  viewBox: string;
  title: string;
  /** Natural width, for figures drawn small enough that the guide's wider
   * column would blow their type up past the prose around them. */
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={title}
      style={{
        width: "100%",
        maxWidth,
        height: "auto",
        display: "block",
        margin: "var(--space-4) 0",
        fontFamily: "var(--font-family)",
      }}
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

/** Arrowhead definition; ids carry a per-figure prefix to stay unique. */
function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
    </marker>
  );
}

/** Point on a circle, measured in degrees clockwise from twelve o'clock. */
function onCircle(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

const CYCLE_STEPS = [
  "Sense",
  "Capture",
  "Assess",
  "Recommend",
  "Communicate",
  "Revisit",
];

function ScoutingCycle() {
  const cx = 310;
  const cy = 196;
  const r = 112;
  const step = 360 / CYCLE_STEPS.length;

  return (
    <Frame viewBox="0 0 620 400" title="The six steps of the scouting cycle">
      <defs>
        <ArrowMarker id="cycle-arrow" color={SOFT} />
      </defs>

      {CYCLE_STEPS.map((_, i) => {
        // A gap either side of each stop keeps the arc clear of its mark.
        const from = onCircle(cx, cy, r, i * step + 14);
        const to = onCircle(cx, cy, r, (i + 1) * step - 14);
        return (
          <path
            key={`arc-${i}`}
            d={`M ${from.x} ${from.y} A ${r} ${r} 0 0 1 ${to.x} ${to.y}`}
            fill="none"
            stroke={SOFT}
            strokeWidth={2}
            markerEnd="url(#cycle-arrow)"
          />
        );
      })}

      <text x={cx} y={cy - 4} textAnchor="middle" {...caps}>
        ONE CYCLE
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12} fill={MUTED}>
        quarterly or biannual
      </text>

      {CYCLE_STEPS.map((name, i) => {
        const angle = i * step;
        const at = onCircle(cx, cy, r, angle);
        const label = onCircle(cx, cy, r + 44, angle);
        const east = Math.sin((angle * Math.PI) / 180);
        const anchor = east > 0.3 ? "start" : east < -0.3 ? "end" : "middle";
        const first = i === 0;
        return (
          <g key={name}>
            <circle
              cx={at.x}
              cy={at.y}
              r={21}
              fill={first ? ACCENT : PAPER}
              stroke={first ? ACCENT : INK}
              strokeWidth={2}
            />
            <text
              x={at.x}
              y={at.y + 5}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              fill={first ? PAPER : INK}
            >
              {i + 1}
            </text>
            <text
              x={label.x}
              y={label.y + 5}
              textAnchor={anchor}
              fontSize={15}
              fontWeight={700}
              fill={INK}
            >
              {name}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/** Upper half-disc of radius `r` about (cx, cy). */
function halfDisc(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`;
}

const RADAR_DOTS = [
  { angle: -68, radius: 44, segment: 0 },
  { angle: -44, radius: 96, segment: 0 },
  { angle: -52, radius: 162, segment: 0 },
  { angle: -14, radius: 72, segment: 1 },
  { angle: -22, radius: 208, segment: 1 },
  { angle: 18, radius: 104, segment: 2 },
  { angle: 34, radius: 166, segment: 2 },
  { angle: 58, radius: 56, segment: 3 },
  { angle: 66, radius: 144, segment: 3 },
  { angle: 76, radius: 218, segment: 3 },
];

function RadarAnatomy() {
  const cx = 310;
  const cy = 306;
  // Outermost first, so the discs paint back to front.
  const radii = [248, 186, 124, 62];

  return (
    <Frame
      viewBox="0 0 620 344"
      title="Anatomy of the radar: segments around, rings outwards"
    >
      <defs>
        <ArrowMarker id="radar-arrow" color={ACCENT} />
      </defs>

      {radii.map((radius, i) => (
        <path
          key={`band-${radius}`}
          d={halfDisc(cx, cy, radius)}
          fill={i % 2 === 0 ? WASH : PAPER}
          stroke={SOFT}
          strokeWidth={1.5}
        />
      ))}

      {[0, 45, 90, 135, 180].map((deg) => {
        const end = onCircle(cx, cy, 248, deg - 90);
        return (
          <line
            key={`spoke-${deg}`}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke={SOFT}
            strokeWidth={1.5}
          />
        );
      })}

      {RADAR_DOTS.map((dot, i) => {
        const at = onCircle(cx, cy, dot.radius, dot.angle);
        return (
          <circle
            key={`dot-${i}`}
            cx={at.x}
            cy={at.y}
            r={6}
            fill={SEGMENT[dot.segment]}
            stroke={PAPER}
            strokeWidth={1.5}
          />
        );
      })}

      {RINGS.map((ring, i) => {
        // `radii` runs outermost-first while the rings run centre-outwards.
        const outer = radii[radii.length - 1 - i]!;
        const inner = radii[radii.length - i] ?? 0;
        return (
          <g key={ring.name}>
            <line
              x1={cx - outer}
              x2={cx - outer}
              y1={cy}
              y2={cy + 7}
              stroke={SOFT}
              strokeWidth={1.5}
            />
            <text
              x={cx - (outer + inner) / 2}
              y={cy + 24}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              letterSpacing="0.06em"
              fill={ring.color}
            >
              {ring.name}
            </text>
          </g>
        );
      })}

      {/* The whole point of the picture is that position carries the message,
          so both axes get named. */}
      <path
        d="M 30 42 L 30 68 L 150 142"
        fill="none"
        stroke={ACCENT}
        strokeWidth={1.5}
        markerEnd="url(#radar-arrow)"
      />
      <text x={20} y={32} {...caps} fill={ACCENT}>
        SEGMENT — AN AREA OF THE BUSINESS
      </text>

      <path
        d="M 590 42 L 590 68 L 442 156"
        fill="none"
        stroke={ACCENT}
        strokeWidth={1.5}
        markerEnd="url(#radar-arrow)"
      />
      <text x={600} y={32} textAnchor="end" {...caps} fill={ACCENT}>
        RING — HOW COMMITTED WE ARE
      </text>
    </Frame>
  );
}

const LIFECYCLE = [
  {
    name: "Backlog",
    gloss: "captured, not yet placed",
    color: "var(--color-status-backlog)",
  },
  {
    name: "On Radar",
    gloss: "a dot, with a ring and a segment",
    color: "var(--color-status-on-radar)",
  },
  {
    name: "Archive",
    gloss: "retired, never deleted",
    color: "var(--color-status-archive)",
  },
];

function Lifecycle() {
  const width = 160;
  const gap = 46;
  const top = 24;
  const height = 52;
  const left = 22;

  return (
    <Frame
      viewBox="0 0 620 158"
      title="A technology moves from Backlog to On Radar to Archive"
    >
      <defs>
        <ArrowMarker id="life-arrow" color={INK} />
        <ArrowMarker id="life-return" color={SOFT} />
      </defs>

      {LIFECYCLE.map((stage, i) => {
        const x = left + i * (width + gap);
        return (
          <g key={stage.name}>
            <rect
              x={x}
              y={top}
              width={width}
              height={height}
              rx={26}
              fill={PAPER}
              stroke={stage.color}
              strokeWidth={2}
            />
            <text
              x={x + width / 2}
              y={top + 32}
              textAnchor="middle"
              fontSize={16}
              fontWeight={700}
              fill={stage.color}
            >
              {stage.name}
            </text>
            <text
              x={x + width / 2}
              y={top + height + 20}
              textAnchor="middle"
              fontSize={12}
              fill={MUTED}
            >
              {stage.gloss}
            </text>
            {i < LIFECYCLE.length - 1 && (
              <line
                x1={x + width + 10}
                y1={top + height / 2}
                x2={x + width + gap - 8}
                y2={top + height / 2}
                stroke={INK}
                strokeWidth={2}
                markerEnd="url(#life-arrow)"
              />
            )}
          </g>
        );
      })}

      {/* Archive is a resting place, not an ending. */}
      <path
        d="M 514 106 C 514 132, 308 132, 308 108"
        fill="none"
        stroke={SOFT}
        strokeWidth={2}
        strokeDasharray="5,5"
        markerEnd="url(#life-return)"
      />
      <text x={411} y={152} textAnchor="middle" fontSize={12} fill={MUTED}>
        can be brought back in a later cycle
      </text>
    </Frame>
  );
}

const ROLES = [
  { name: "Admin", adds: "+ users, visibility, settings, backups, API keys" },
  { name: "Writer", adds: "+ add & edit, cycles, groups, people, imports" },
  { name: "Reader", adds: "+ the full radar and every technology detail" },
  { name: "Public reader", adds: "the radar, public fields only" },
];

function Roles() {
  const inset = 28;

  return (
    <Frame
      viewBox="0 0 620 224"
      title="Each role contains the one before it, from Public reader out to Admin"
    >
      {ROLES.map((role, i) => {
        const x = 8 + i * inset;
        const y = 8 + i * inset;
        const width = 604 - i * inset * 2;
        const height = 202 - i * inset * 2;
        const innermost = i === ROLES.length - 1;
        return (
          <g key={role.name}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={12}
              fill={innermost ? WASH : PAPER}
              stroke={INK}
              strokeWidth={1.5}
              strokeOpacity={0.3 + i * 0.2}
            />
            <text
              x={x + 16}
              y={y + 22}
              fontSize={14}
              fontWeight={700}
              fill={INK}
            >
              {role.name}
            </text>
            <text
              x={x + width - 16}
              y={y + 22}
              textAnchor="end"
              fontSize={12}
              fill={MUTED}
            >
              {role.adds}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/** A link in the style d3's `linkHorizontal` draws. */
function hLink(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

const COLUMN_X = [46, 150, 254];
type ColumnNode = { level: number; y: number; parent?: number };
const COLUMN_TREE: ColumnNode[] = [
  { level: 0, y: 118 },
  { level: 1, y: 74, parent: 0 },
  { level: 1, y: 162, parent: 0 },
  { level: 2, y: 50, parent: 1 },
  { level: 2, y: 98, parent: 1 },
  { level: 2, y: 140, parent: 2 },
  { level: 2, y: 184, parent: 2 },
];

const RING_RADIUS = [0, 44, 88];
type RadialNode = { ring: number; angle: number; parent?: number };
// Spread right round the circle: a radial layout that only fills the top half
// reads as a mistake rather than as a layout.
const RADIAL_TREE: RadialNode[] = [
  { ring: 0, angle: 0 },
  { ring: 1, angle: 0, parent: 0 },
  { ring: 1, angle: 120, parent: 0 },
  { ring: 1, angle: 240, parent: 0 },
  { ring: 2, angle: -34, parent: 1 },
  { ring: 2, angle: 34, parent: 1 },
  { ring: 2, angle: 86, parent: 2 },
  { ring: 2, angle: 154, parent: 2 },
  { ring: 2, angle: 206, parent: 3 },
  { ring: 2, angle: 274, parent: 3 },
];

function TreeLayouts() {
  const rcx = 468;
  const rcy = 118;

  return (
    <Frame
      viewBox="0 0 620 232"
      title="The same tree drawn as columns and as rings"
    >
      {COLUMN_X.map((x, level) => (
        <g key={`lane-${level}`}>
          <rect
            x={x - 42}
            y={28}
            width={84}
            height={180}
            rx={8}
            fill={SOFT}
            fillOpacity={level % 2 === 0 ? 0.2 : 0.08}
          />
          <line
            x1={x - 30}
            x2={x + 30}
            y1={20}
            y2={20}
            stroke={LEVEL[level]}
            strokeWidth={2}
          />
        </g>
      ))}

      {COLUMN_TREE.map((node, i) => {
        if (node.parent === undefined) return null;
        const parent = COLUMN_TREE[node.parent]!;
        return (
          <path
            key={`clink-${i}`}
            d={hLink(
              COLUMN_X[parent.level]!,
              parent.y,
              COLUMN_X[node.level]!,
              node.y,
            )}
            fill="none"
            stroke={LEVEL[parent.level]}
            strokeWidth={1.75}
            strokeOpacity={0.65}
          />
        );
      })}
      {COLUMN_TREE.map((node, i) => (
        <circle
          key={`cnode-${i}`}
          cx={COLUMN_X[node.level]!}
          cy={node.y}
          r={node.level === 2 ? 5 : 8}
          fill={node.level === 2 ? SEGMENT[i % SEGMENT.length] : PAPER}
          stroke={LEVEL[node.level]}
          strokeWidth={2}
        />
      ))}

      {RING_RADIUS.slice(1).map((radius, i) => (
        <circle
          key={`ring-${radius}`}
          cx={rcx}
          cy={rcy}
          r={radius}
          fill="none"
          stroke={LEVEL[i + 1]}
          strokeWidth={1.5}
          strokeDasharray="3,5"
          strokeOpacity={0.55}
        />
      ))}
      {RADIAL_TREE.map((node, i) => {
        if (node.parent === undefined) return null;
        const parent = RADIAL_TREE[node.parent]!;
        const from = onCircle(
          rcx,
          rcy,
          RING_RADIUS[parent.ring]!,
          parent.angle,
        );
        const to = onCircle(rcx, rcy, RING_RADIUS[node.ring]!, node.angle);
        const bend = `${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 6}`;
        return (
          <path
            key={`rlink-${i}`}
            d={`M ${from.x} ${from.y} Q ${bend} ${to.x} ${to.y}`}
            fill="none"
            stroke={LEVEL[parent.ring]}
            strokeWidth={1.75}
            strokeOpacity={0.65}
          />
        );
      })}
      {RADIAL_TREE.map((node, i) => {
        const at = onCircle(rcx, rcy, RING_RADIUS[node.ring]!, node.angle);
        return (
          <circle
            key={`rnode-${i}`}
            cx={at.x}
            cy={at.y}
            r={node.ring === 2 ? 5 : 8}
            fill={node.ring === 2 ? SEGMENT[i % SEGMENT.length] : PAPER}
            stroke={LEVEL[node.ring]}
            strokeWidth={2}
          />
        );
      })}

      <text x={150} y={226} textAnchor="middle" {...caps}>
        COLUMNS — A GENERATION PER LANE
      </text>
      <text x={468} y={226} textAnchor="middle" {...caps}>
        RADIAL — DEPTH AS DISTANCE
      </text>
    </Frame>
  );
}

const NODE_KINDS = [
  { name: "Label group", gloss: "an umbrella with no technology behind it" },
  { name: "Technology group", gloss: "a technology that also has children" },
  { name: "Technology", gloss: "a leaf, with nothing filed under it" },
];

function TreeNodes() {
  return (
    <Frame
      viewBox="0 0 350 146"
      title="The three kinds of node in the group tree"
      maxWidth={420}
    >
      {NODE_KINDS.map((kind, i) => {
        const y = 28 + i * 44;
        return (
          <g key={kind.name}>
            {i === 0 && (
              <rect
                x={22}
                y={y - 8}
                width={16}
                height={16}
                fill="none"
                stroke={LEVEL[0]}
                strokeWidth={2}
                strokeDasharray="3,2"
              />
            )}
            {i === 1 && (
              <>
                <circle
                  cx={30}
                  cy={y}
                  r={11.5}
                  fill="none"
                  stroke={LEVEL[1]}
                  strokeWidth={2}
                />
                <circle cx={30} cy={y} r={5.5} fill={SEGMENT[2]} />
              </>
            )}
            {i === 2 && <circle cx={30} cy={y} r={5.5} fill={SEGMENT[1]} />}
            <text x={56} y={y - 2} fontSize={14} fontWeight={700} fill={INK}>
              {kind.name}
            </text>
            <text x={56} y={y + 14} fontSize={12} fill={MUTED}>
              {kind.gloss}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

const figures: Record<string, () => ReactElement> = {
  "scouting-cycle": ScoutingCycle,
  "radar-anatomy": RadarAnatomy,
  lifecycle: Lifecycle,
  roles: Roles,
  "tree-layouts": TreeLayouts,
  "tree-nodes": TreeNodes,
};

const FIGURE_PREFIX = "figure:";

export function isFigureSrc(src: string | undefined): src is string {
  return typeof src === "string" && src.startsWith(FIGURE_PREFIX);
}

/**
 * Render the figure named by a `figure:` source, or nothing if the name is
 * unknown — a typo in a content file should cost a picture, not the page.
 */
export function GuideFigure({ src }: { src: string }) {
  const Figure = figures[src.slice(FIGURE_PREFIX.length)];
  return Figure ? <Figure /> : null;
}
