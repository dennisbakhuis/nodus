import { type CSSProperties } from "react";

type RegistryStatus = "OnRadar" | "Backlog" | "Archive";

type Props = {
  status: RegistryStatus | string;
  style?: CSSProperties;
};

type StyleDef = {
  backgroundColor: string;
  color: string;
  label: string;
};

function statusStyle(status: string): StyleDef {
  switch (status) {
    case "OnRadar":
      return {
        backgroundColor: "var(--color-brand-dark-blue)",
        color: "var(--color-white)",
        label: "On Radar",
      };
    case "Backlog":
      return {
        backgroundColor: "var(--color-hover-bg)",
        color: "var(--color-muted-text)",
        label: "Backlog",
      };
    case "Archive":
      return {
        backgroundColor: "var(--color-border)",
        color: "var(--color-muted-text)",
        label: "Archive",
      };
    default:
      return {
        backgroundColor: "var(--color-border)",
        color: "var(--color-muted-text)",
        label: status,
      };
  }
}

export function StatusBadge({ status, style }: Props) {
  const { backgroundColor, color, label } = statusStyle(status);

  return (
    <span
      aria-label={`Status: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px var(--space-3)",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-bold)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        backgroundColor,
        color,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
