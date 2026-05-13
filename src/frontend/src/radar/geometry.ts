/**
 * Pure geometry math for the radar visualisation. No JSX, no React, no
 * DOM — just SVG path strings, layout constants, and the focus-transform
 * helper. Single home for the geometry contract.
 */

// SVG viewport
export const SVG_W = 1100;
export const SVG_H = 580;
export const CX = SVG_W / 2;
export const CY = SVG_H - 30;

// Ring + label radii
export const R_OUTER = 360;
export const R_INNER = 55;
export const LABEL_R = R_OUTER + 20;

// Tight viewBox crops the large empty area above the half-disc arc.
export const VB_Y = CY - LABEL_R - 40; // 130
export const VB_H = SVG_H - VB_Y; //      450

// Zoom / focus
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 4;
export const WHEEL_ZOOM_FACTOR = 1.08;
export const WHEEL_ZOOM_NORMALIZE = 100;

/**
 * Shrink labels and dots while a single segment is focused so they don't
 * feel oversized after the focus transform has already scaled the slice up.
 */
export const FOCUS_INNER_SCALE = 0.75;

/** Per-dot radial jitter inside its ring band (fraction of the band height). */
export const DOT_RADIAL_JITTER = 0.55;

/** SVG path for the upper half-arc of a circle of radius ``r`` at (cx, cy). */
export function halfArcPath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
}

/**
 * Cheap deterministic 0..1 hash from a string. Used for label / dot jitter
 * so a tech's position is stable across reloads without an explicit seed.
 */
export function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h / 0xffffffff;
}

/**
 * Arc segment from ``startAngle`` to ``endAngle`` (radians, math-convention,
 * counter-clockwise from +x). y is negated so the radar reads as a
 * top-half-circle in SVG's downward-y coordinate system.
 */
export function arcSegmentPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const x0 = cx + r * Math.cos(startAngle);
  const y0 = cy - r * Math.sin(startAngle);
  const x1 = cx + r * Math.cos(endAngle);
  const y1 = cy - r * Math.sin(endAngle);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 0 ${x1} ${y1}`;
}

/**
 * Maps a viewBox-coord point through focusG's transform:
 * ``f(p) = A + σ·R(α)·(p - C)`` where C = (CX, CY) and A = (apexX, apexY).
 *
 * Used to draw cross-segment relation curves *outside* focusG while still
 * anchoring their source at the in-slice dot's on-screen position. Without
 * this we'd need to nest every relation under focusG and stop scaling them.
 */
export function applyFocusTransform(
  x: number,
  y: number,
  focusScale: number,
  rotateRad: number,
  apexX: number,
  apexY: number,
): { x: number; y: number } {
  const dx = x - CX;
  const dy = y - CY;
  const cosA = Math.cos(rotateRad);
  const sinA = Math.sin(rotateRad);
  return {
    x: apexX + focusScale * (cosA * dx - sinA * dy),
    y: apexY + focusScale * (sinA * dx + cosA * dy),
  };
}

/**
 * Filled annular sector path between two radii and two angles. Used for
 * ring-band fills behind the dots (one path per (segment × ring) cell).
 */
export function segBandPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const x1i = cx + innerR * Math.cos(startAngle);
  const y1i = cy - innerR * Math.sin(startAngle);
  const x2i = cx + innerR * Math.cos(endAngle);
  const y2i = cy - innerR * Math.sin(endAngle);
  const x1o = cx + outerR * Math.cos(startAngle);
  const y1o = cy - outerR * Math.sin(startAngle);
  const x2o = cx + outerR * Math.cos(endAngle);
  const y2o = cy - outerR * Math.sin(endAngle);
  return (
    `M ${x1o} ${y1o} ` +
    `A ${outerR} ${outerR} 0 0 0 ${x2o} ${y2o} ` +
    `L ${x2i} ${y2i} ` +
    `A ${innerR} ${innerR} 0 0 1 ${x1i} ${y1i} Z`
  );
}
