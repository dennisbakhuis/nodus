import { type ReactNode, type CSSProperties } from "react";

type Variant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

type Props = {
  variant?: Variant;
  children: ReactNode;
  style?: CSSProperties;
};

function variantStyle(variant: Variant): CSSProperties {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: "var(--color-brand-dark-blue)",
        color: "var(--color-white)",
      };
    case "success":
      return {
        backgroundColor: "var(--color-success)",
        color: "var(--color-white)",
      };
    case "warning":
      return {
        backgroundColor: "var(--color-warning)",
        color: "var(--color-dark-text)",
      };
    case "danger":
      return {
        backgroundColor: "var(--color-danger)",
        color: "var(--color-white)",
      };
    case "info":
      return {
        backgroundColor: "var(--color-brand-bright-blue)",
        color: "var(--color-white)",
      };
    case "neutral":
      return {
        backgroundColor: "var(--color-border)",
        color: "var(--color-muted-text)",
      };
    default:
      return {
        backgroundColor: "var(--color-hover-bg)",
        color: "var(--color-dark-text)",
        border: "1px solid var(--color-border)",
      };
  }
}

export function Badge({ variant = "default", children, style }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-medium)",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...variantStyle(variant),
        ...style,
      }}
    >
      {children}
    </span>
  );
}
