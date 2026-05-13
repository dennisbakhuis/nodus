import type { ReactNode } from "react";

export type StatusBannerVariant = "success" | "error" | "info" | "warning";

type Props = {
  variant: StatusBannerVariant;
  /**
   * Banner message. Pass `null` to hide. Hidden banners still render an empty
   * `aria-live` region so screen-reader announcements fire when a message
   * later appears.
   */
  message: ReactNode | null;
  onDismiss?: () => void;
};

const VARIANT_STYLES: Record<
  StatusBannerVariant,
  { bg: string; border: string; color: string; role: "status" | "alert" }
> = {
  success: {
    bg: "rgba(27,123,52,0.10)",
    border: "rgba(27,123,52,0.35)",
    color: "var(--color-success)",
    role: "status",
  },
  info: {
    bg: "rgba(45,139,201,0.10)",
    border: "rgba(45,139,201,0.35)",
    color: "var(--color-info)",
    role: "status",
  },
  warning: {
    bg: "rgba(232,163,23,0.12)",
    border: "rgba(232,163,23,0.40)",
    color: "var(--color-warning)",
    role: "status",
  },
  error: {
    bg: "rgba(194,59,34,0.10)",
    border: "rgba(194,59,34,0.40)",
    color: "var(--color-danger)",
    role: "alert",
  },
};

/**
 * Single source of truth for save / error / info banners.
 *
 * Wraps every visible status update in a polite live region so screen-reader
 * users hear the change without breaking flow. `error` variant uses
 * `role="alert"` (assertive) so users hear it immediately.
 */
export function StatusBanner({ variant, message, onDismiss }: Props) {
  const v = VARIANT_STYLES[variant];
  return (
    <div
      role={v.role}
      aria-live={v.role === "alert" ? "assertive" : "polite"}
      style={{
        minHeight: message != null ? undefined : 0,
        padding: message != null ? "var(--space-3)" : 0,
        marginBottom: message != null ? "var(--space-3)" : 0,
        background: v.bg,
        color: v.color,
        border: message != null ? `1px solid ${v.border}` : undefined,
        borderRadius: "var(--radius-md)",
        display: message != null ? "flex" : "block",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        fontSize: "var(--font-size-body)",
      }}
    >
      {message != null && <span>{message}</span>}
      {message != null && onDismiss !== undefined && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{
            background: "transparent",
            border: "none",
            color: v.color,
            cursor: "pointer",
            fontSize: "var(--font-size-md)",
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
