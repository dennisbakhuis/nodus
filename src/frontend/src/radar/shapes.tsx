/**
 * Radar dot shape renderers.
 *
 * Pure SVG primitives — circle, star, arrow — selected based on the active
 * shape encoding mode. Single home for the shape catalogue so future
 * encoding modes can be added without touching RadarView.
 */

import type { ReactElement } from "react";
import type { ShapeMode } from "./types";
import { CX, CY } from "./geometry";

/** 5-point star centered at origin, outer radius ``r``, inner radius ``0.45·r``. */
export function starPolygonPoints(r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    points.push(
      `${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return points.join(" ");
}

/**
 * Triangle pointing along +x at origin, stretched so the arrow reads even
 * when small. Callers rotate it to point inward (promoted) or outward
 * (demoted).
 */
export function arrowPolygonPoints(r: number): string {
  const tip = r * 1.4;
  const back = -r * 0.7;
  const half = r * 0.95;
  return `${tip},0 ${back},${half} ${back},${-half}`;
}

/**
 * Render a single dot's shape based on the active shape mode + the entry's
 * movement. Falls back to a plain circle when shape mode is "dot" or when
 * the movement isn't one of new / promoted / demoted.
 */
export function renderEntryShape(
  d: { arcX: number; arcY: number; movement: string | null },
  r: number,
  fill: string,
  shapeMode: ShapeMode,
): ReactElement {
  const cx = d.arcX;
  const cy = d.arcY;
  const useShape =
    shapeMode === "movement" &&
    (d.movement === "new" ||
      d.movement === "promoted" ||
      d.movement === "demoted");

  if (!useShape) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        stroke="white"
        strokeWidth={1.5}
      />
    );
  }

  if (d.movement === "new") {
    return (
      <polygon
        points={starPolygonPoints(r * 1.35)}
        fill={fill}
        stroke="white"
        strokeWidth={1}
        transform={`translate(${cx},${cy})`}
      />
    );
  }

  // Promoted = arrow pointing toward the radar's center; demoted = away.
  const dx = CX - cx;
  const dy = CY - cy;
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (d.movement === "demoted") angleDeg += 180;
  return (
    <polygon
      points={arrowPolygonPoints(r * 1.25)}
      fill={fill}
      stroke="white"
      strokeWidth={1}
      transform={`translate(${cx},${cy}) rotate(${angleDeg})`}
    />
  );
}
