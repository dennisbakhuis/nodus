/**
 * Visual vocabulary for the tree view.
 *
 * The three group-node kinds are separated by **shape**, not hue: colour is
 * already carrying segment and ring meaning, and the app has no dark theme to
 * fall back on. A hollow dashed square reads as "not a thing on the radar"
 * without inventing a new colour.
 */

import type { TreeNodeKind } from "./groupForest";

/**
 * Per-depth accent colours, mirroring the sidebar's group tree.
 *
 * One per level the backend can be configured to allow, so the ramp never
 * wraps: `GROUP_DEPTH_HARD_LIMIT` is 12 precisely because this is where a
 * legible set of level accents runs out.
 *
 * Built as a spectral sweep in OKLCH — twelve hues starting at the Nodus blue
 * and stepping right round the wheel — held at a **constant lightness** of
 * L 0.55. Uniform lightness is what matters here: these are drawn as 2px
 * strokes and 11px small capitals, so a level that happened to be vivid would
 * read as more important than its neighbours rather than merely different.
 * Every entry clears 4.5:1 against white. Chroma is whatever each hue can
 * carry at that lightness, which is why the ambers are quieter than the
 * blues — there is no vivid dark yellow, and faking one costs legibility.
 *
 * The twelve are then listed in a 150°-apart order rather than around the
 * wheel. Neighbouring levels are the pair a reader has to tell apart — they
 * sit in touching columns — and a smooth sweep would hand a four-level forest
 * four near-identical blues. Stepping five hues at a time still visits all
 * twelve (5 and 12 are coprime) while putting the wheel's full width between
 * any two adjacent levels.
 */
const GROUP_DEPTH_COLORS = [
  "#1c78b1", // 1  blue
  "#bd4045", // 2  red
  "#1d846b", // 3  teal
  "#944fb0", // 4  purple
  "#767719", // 5  olive
  "#456ace", // 6  indigo
  "#b05318", // 7  orange
  "#1d8085", // 8  cyan
  "#ab448e", // 9  magenta
  "#1d882d", // 10 green
  "#735cc7", // 11 violet
  "#936919", // 12 amber
];

/** How many distinct level accents exist before `groupDepthColor` wraps. */
export const GROUP_DEPTH_COLOR_COUNT = GROUP_DEPTH_COLORS.length;

export function groupDepthColor(depth: number): string {
  return GROUP_DEPTH_COLORS[
    ((depth % GROUP_DEPTH_COLORS.length) + GROUP_DEPTH_COLORS.length) %
      GROUP_DEPTH_COLORS.length
  ] as string;
}

export type NodeMarkSpec = {
  /** Radius of the primary mark, and the hit area the label is offset from. */
  radius: number;
  /** Concentric outer ring, drawn only for a technology that is also a parent. */
  outerRadius: number | null;
  /** Square marks are drawn as a rounded rect rather than a circle. */
  square: boolean;
  dashed: boolean;
  filled: boolean;
  bold: boolean;
};

export const NODE_MARKS: Record<TreeNodeKind, NodeMarkSpec> = {
  labelGroup: {
    radius: 8,
    outerRadius: null,
    square: true,
    dashed: true,
    filled: false,
    bold: true,
  },
  technologyGroup: {
    radius: 7.5,
    outerRadius: 11.5,
    square: false,
    dashed: false,
    filled: true,
    bold: true,
  },
  technology: {
    radius: 5.5,
    outerRadius: null,
    square: false,
    dashed: false,
    filled: true,
    bold: false,
  },
};

/**
 * Column caption for a dependency level.
 *
 * The sign convention is deliberately counter-intuitive and lives only here and
 * in `xForLevel`: upstream is **positive** and sits on the **left**, so x
 * decreases as the level rises.
 */
export function levelHeaderLabel(level: number): string {
  if (level === 0) return "ANCHOR";
  if (level > 0) return `UPSTREAM · LEVEL +${level}`;
  return `DOWNSTREAM · LEVEL ${level}`;
}

/** Column caption for a group depth (0-based). */
export function depthHeaderLabel(depth: number): string {
  return `LEVEL ${depth + 1}`;
}

/**
 * Accent for a column or ring header.
 *
 * Group depths reuse the sidebar's depth colours so a column, a mark's outer
 * ring and a sidebar row all agree. Dependency levels have no depth to speak
 * of, so they take the anchor/upstream/downstream reading instead.
 */
export function columnAccent(level: number, palette: "depth" | "relation") {
  if (palette === "depth") return groupDepthColor(level);
  if (level === 0) return "var(--color-brand-orange)";
  return level > 0
    ? "var(--color-brand-dark-blue)"
    : "var(--color-brand-light-blue)";
}
