/**
 * Visual vocabulary for the tree view.
 *
 * The three group-node kinds are separated by **shape**, not hue: colour is
 * already carrying segment and ring meaning, and the app has no dark theme to
 * fall back on. A hollow dashed square reads as "not a thing on the radar"
 * without inventing a new colour.
 */

import type { TreeNodeKind } from "./groupForest";

/** Per-depth accent colours, mirroring the sidebar's group tree. */
const GROUP_DEPTH_COLORS = ["#2d8bc9", "#7c3aed", "#1b7b34", "#e08a00"];

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
    radius: 7,
    outerRadius: null,
    square: true,
    dashed: true,
    filled: false,
    bold: true,
  },
  technologyGroup: {
    radius: 7,
    outerRadius: 10,
    square: false,
    dashed: false,
    filled: true,
    bold: true,
  },
  technology: {
    radius: 6,
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
