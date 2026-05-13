/**
 * Predefined color themes for radar segments.
 *
 * Each theme bundles every color that radar elements need for a single segment:
 * a dim background fill for the wedge, a brighter dot color for technologies in
 * that segment, and complementary label/chip styling. Segments persist a
 * `theme_key` referring to one of these entries, so the visual appearance is
 * decoupled from segment ordering.
 */

export type SegmentTheme = {
  key: string;
  label: string;
  sliceFill: string;
  sliceStroke: string;
  dot: string;
  labelText: string;
  chipBg: string;
  chipText: string;
};

export const SEGMENT_THEMES: SegmentTheme[] = [
  {
    key: "dark-blue",
    label: "Brand Dark Blue",
    sliceFill: "#dde6f4",
    sliceStroke: "#8ea7c8",
    dot: "#003584",
    labelText: "#003584",
    chipBg: "#dde6f4",
    chipText: "#003584",
  },
  {
    key: "bright-blue",
    label: "Sky Blue",
    sliceFill: "#dceeff",
    sliceStroke: "#8fbce4",
    dot: "#2d8bc9",
    labelText: "#1f5f8f",
    chipBg: "#dceeff",
    chipText: "#1f5f8f",
  },
  {
    key: "green",
    label: "Forest Green",
    sliceFill: "#dcefda",
    sliceStroke: "#8fbf85",
    dot: "#1b7b34",
    labelText: "#1b5e26",
    chipBg: "#dcefda",
    chipText: "#1b5e26",
  },
  {
    key: "violet",
    label: "Violet",
    sliceFill: "#e7defa",
    sliceStroke: "#a98fde",
    dot: "#7c3aed",
    labelText: "#5b25b3",
    chipBg: "#e7defa",
    chipText: "#5b25b3",
  },
  {
    key: "gold",
    label: "Gold",
    sliceFill: "#faecca",
    sliceStroke: "#d2b070",
    dot: "#e8a317",
    labelText: "#a47410",
    chipBg: "#faecca",
    chipText: "#a47410",
  },
  {
    key: "rose",
    label: "Rose",
    sliceFill: "#fadce4",
    sliceStroke: "#d28599",
    dot: "#c23b6a",
    labelText: "#8c2349",
    chipBg: "#fadce4",
    chipText: "#8c2349",
  },
  {
    key: "teal",
    label: "Teal",
    sliceFill: "#d4eeec",
    sliceStroke: "#7ebab5",
    dot: "#0e8a85",
    labelText: "#0a605c",
    chipBg: "#d4eeec",
    chipText: "#0a605c",
  },
  {
    key: "amber",
    label: "Amber",
    sliceFill: "#fadccb",
    sliceStroke: "#d99467",
    dot: "#d2691e",
    labelText: "#8a4513",
    chipBg: "#fadccb",
    chipText: "#8a4513",
  },
  {
    key: "slate",
    label: "Slate",
    sliceFill: "#e2e8f0",
    sliceStroke: "#94a3b8",
    dot: "#475569",
    labelText: "#1e293b",
    chipBg: "#e2e8f0",
    chipText: "#1e293b",
  },
  {
    key: "magenta",
    label: "Magenta",
    sliceFill: "#fadcef",
    sliceStroke: "#d287b9",
    dot: "#c2185b",
    labelText: "#8a1144",
    chipBg: "#fadcef",
    chipText: "#8a1144",
  },
];

export const DEFAULT_SEGMENT_THEME: SegmentTheme = SEGMENT_THEMES[0]!;

export function themeByKey(key: string | null | undefined): SegmentTheme {
  if (!key) return DEFAULT_SEGMENT_THEME;
  const match = SEGMENT_THEMES.find((t) => t.key === key);
  return match ?? DEFAULT_SEGMENT_THEME;
}
