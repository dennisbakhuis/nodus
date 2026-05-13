/**
 * Radar dot color / shape encoding palettes.
 *
 * Pure data + a small bucket helper. Single home so the legend component
 * and any future encoding-picker UI can reach for these directly without
 * pulling in the radar visualisation as a whole.
 */

export type RelationCategory = "drives" | "relates_to" | "hinders";

export const RELATION_STROKES: Record<
  RelationCategory,
  { color: string; dash?: string; label: string }
> = {
  drives: { color: "var(--color-brand-dark-blue)", label: "drives" },
  relates_to: { color: "var(--color-brand-orange)", label: "relates to" },
  hinders: { color: "#c0392b", dash: "5,3", label: "hinders" },
};

/** Used when a dot has no value for the active color encoding. */
export const NO_VALUE_COLOR = "var(--color-ring-boundary, #cbd5e1)";

/**
 * Ring → dot fill color. Methodology names are the canonical keys; legacy
 * ring tokens remain as aliases of these so they resolve to the same hex.
 */
export const RING_DOT_COLORS: Record<string, string> = {
  Invest: "var(--color-ring-invest)",
  Pilot: "var(--color-ring-trial)",
  Explore: "var(--color-ring-assess)",
  Monitor: "var(--color-ring-watch)",
};

/**
 * One color per TRL level. ColorBrewer RdYlGn-9 — vetted sequential
 * stoplight from "concept / risky" (red) through "demonstrating" (yellow)
 * to "in service" (deep green). Each step is perceptibly distinct on a
 * white background and the ordering reads naturally as risk → readiness.
 */
export const TRL_COLOR_BY_LEVEL: Record<number, string> = {
  1: "#a50026",
  2: "#d73027",
  3: "#f46d43",
  4: "#fdae61",
  5: "#fee08b",
  6: "#d9ef8b",
  7: "#a6d96a",
  8: "#66bd63",
  9: "#1a9850",
};

export const TRL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function trlBucketColor(trl: number | null | undefined): string {
  if (trl == null) return NO_VALUE_COLOR;
  return TRL_COLOR_BY_LEVEL[trl] ?? NO_VALUE_COLOR;
}

/**
 * Time-to-mainstream → color. Keys match the backend ``TimeToMainstream``
 * enum strings exactly (with the methodology space before "yr") so entries
 * returned by the radar API map cleanly without normalisation.
 */
export const TTM_COLORS: Record<string, string> = {
  "0-2 yr": "#1b7b34",
  "2-5 yr": "#7eb86b",
  "5-7 yr": "#e8a317",
  "7-10 yr": "#c0392b",
};

export const RELEVANCE_COLORS: Record<string, string> = {
  High: "#1b7b34",
  Medium: "#e8a317",
  Low: "#94a3b8",
};

export const MOVEMENT_COLORS: Record<string, string> = {
  new: "var(--color-movement-new)",
  promoted: "var(--color-movement-up)",
  demoted: "var(--color-movement-down)",
  unchanged: "var(--color-movement-unchanged)",
  removed: "var(--color-ring-watch)",
};
