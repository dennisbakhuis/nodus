import { type CSSProperties } from "react";

type Ring = "Invest" | "Pilot" | "Explore" | "Monitor";

type Props = {
  ring: Ring | string;
  style?: CSSProperties;
};

function ringColor(ring: string): string {
  switch (ring) {
    case "Invest":
      return "var(--color-ring-invest)";
    case "Pilot":
      return "var(--color-ring-pilot)";
    case "Explore":
      return "var(--color-ring-explore)";
    case "Monitor":
      return "var(--color-ring-monitor)";
    default:
      return "var(--color-muted-text)";
  }
}

export function RingBadge({ ring, style }: Props) {
  const color = ringColor(ring);

  return (
    <span
      aria-label={`Ring: ${ring}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-bold)",
        border: `1px solid ${color}`,
        color,
        backgroundColor: "var(--color-white)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "var(--radius-full)",
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      {ring}
    </span>
  );
}
