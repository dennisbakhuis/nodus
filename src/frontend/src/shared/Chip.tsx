import { type ReactNode, type CSSProperties } from "react";

export type ChipVariant = "tag" | "filter";

type Props = {
  children: ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
  /**
   * `tag` (default) — bordered pill used for alias / category badges inside
   * topic detail. Slightly larger, used in flowing text.
   *
   * `filter` — compact filter-rail chip used by the radar's Sidebar /
   * FilterBar. Smaller, no border, button element. Single source of truth
   * for all filter chips across the app.
   */
  variant?: ChipVariant;
  /**
   * Optional inactive-state overrides for filter variant — used when a
   * segment chip should match its segment's brand color when not pressed.
   */
  inactiveBg?: string;
  inactiveText?: string;
};

const TAG_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-1)",
  padding: "var(--space-1) var(--space-3)",
  borderRadius: "var(--radius-full)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)",
  border: "1px solid var(--color-border-strong)",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const FILTER_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "none",
  borderRadius: "12px",
  padding: "3px 10px",
  fontSize: "11px",
  fontFamily: "var(--font-family)",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

export function Chip({
  children,
  onRemove,
  onClick,
  active,
  disabled,
  ariaLabel,
  style,
  variant = "tag",
  inactiveBg,
  inactiveText,
}: Props) {
  const isInteractive = onClick != null || onRemove != null;
  const transition =
    "background-color var(--transition-fast), color var(--transition-fast)";

  if (variant === "filter") {
    // Filter variant renders as a real <button> for native focus handling.
    return (
      <button
        type="button"
        onClick={!disabled ? onClick : undefined}
        aria-pressed={onClick != null ? active : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        style={{
          ...FILTER_STYLE,
          fontWeight: active
            ? "var(--font-weight-medium)"
            : "var(--font-weight-regular)",
          background: active
            ? "var(--color-active-filter)"
            : (inactiveBg ?? "var(--color-page-background)"),
          color: active
            ? "var(--color-white)"
            : (inactiveText ?? "var(--color-dark-text)"),
          transition,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          ...style,
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      role={onClick != null ? "button" : undefined}
      tabIndex={onClick != null && !disabled ? 0 : undefined}
      aria-label={ariaLabel}
      aria-pressed={onClick != null ? active : undefined}
      onClick={!disabled ? onClick : undefined}
      onKeyDown={
        onClick != null && !disabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        ...TAG_STYLE,
        backgroundColor: active
          ? "var(--color-brand-dark-blue)"
          : "var(--color-white)",
        color: active ? "var(--color-white)" : "var(--color-dark-text)",
        cursor: disabled
          ? "not-allowed"
          : isInteractive
            ? "pointer"
            : "default",
        opacity: disabled ? 0.5 : 1,
        transition,
        ...style,
      }}
    >
      {children}
      {onRemove != null && (
        <button
          type="button"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onRemove();
          }}
          disabled={disabled}
          style={{
            background: "none",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            marginLeft: "2px",
            fontSize: "var(--font-size-sm)",
            lineHeight: 1,
            color: "inherit",
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}
