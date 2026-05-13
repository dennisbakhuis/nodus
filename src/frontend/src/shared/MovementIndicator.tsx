import { type CSSProperties } from "react";

type Movement =
  | "up"
  | "down"
  | "new"
  | "unchanged"
  | "promoted"
  | "demoted"
  | "removed";

type Props = {
  movement: Movement | string;
  showLabel?: boolean;
  style?: CSSProperties;
};

type IndicatorDef = {
  symbol: string;
  color: string;
  label: string;
  ariaLabel: string;
};

function indicatorFor(movement: string | null | undefined): IndicatorDef {
  switch ((movement ?? "").toLowerCase()) {
    case "up":
    case "promoted":
      return {
        symbol: "▲",
        color: "var(--color-movement-up)",
        label: "Promoted",
        ariaLabel: "Promoted (moved inward)",
      };
    case "down":
    case "demoted":
      return {
        symbol: "▼",
        color: "var(--color-movement-down)",
        label: "Demoted",
        ariaLabel: "Demoted (moved outward)",
      };
    case "new":
      return {
        symbol: "★",
        color: "var(--color-movement-new)",
        label: "New",
        ariaLabel: "New this cycle",
      };
    case "removed":
      return {
        symbol: "✕",
        color: "var(--color-danger)",
        label: "Removed",
        ariaLabel: "Removed from radar",
      };
    default:
      return {
        symbol: "●",
        color: "var(--color-movement-unchanged)",
        label: "No change",
        ariaLabel: "No change this cycle",
      };
  }
}

export function MovementIndicator({
  movement,
  showLabel = false,
  style,
}: Props) {
  const { symbol, color, label, ariaLabel } = indicatorFor(movement);

  return (
    <span
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        color,
        fontSize: "var(--font-size-sm)",
        fontWeight: "var(--font-weight-bold)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span aria-hidden="true">{symbol}</span>
      {showLabel && (
        <span style={{ fontSize: "var(--font-size-xs)" }}>{label}</span>
      )}
    </span>
  );
}
