/**
 * Floating action pill.
 *
 * Pill-shaped button that floats above another surface (typically the
 * radar SVG or a map). Currently used for the "← All segments" focus
 * escape; future surfaces can land here so the pill style stays
 * consistent across the app.
 */

import type { CSSProperties, ReactNode } from "react";

type Props = {
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
  /**
   * Absolute placement relative to the parent positioned container.
   * Defaults to top-left ({ top: 130, left: "var(--space-3)" }).
   */
  position?: Pick<CSSProperties, "top" | "right" | "bottom" | "left">;
};

const DEFAULT_POSITION: Pick<CSSProperties, "top" | "left"> = {
  top: 130,
  left: "var(--space-3)",
};

export function FloatingActionPill({
  onClick,
  ariaLabel,
  children,
  position,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        position: "absolute",
        ...(position ?? DEFAULT_POSITION),
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-4)",
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(4px)",
        border: "1px solid var(--color-ring-boundary)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        cursor: "pointer",
        fontFamily: "var(--font-family)",
        fontSize: "var(--font-size-sm)",
        fontWeight: "var(--font-weight-medium)",
        color: "var(--color-dark-blue)",
      }}
    >
      {children}
    </button>
  );
}
