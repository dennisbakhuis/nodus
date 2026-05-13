import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "header";
type Size = "xs" | "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  active?: boolean;
};

function variantStyle(variant: Variant, active: boolean): CSSProperties {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: "var(--color-brand-dark-blue)",
        color: "var(--color-white)",
        border: "2px solid var(--color-brand-dark-blue)",
      };
    case "secondary":
      return {
        backgroundColor: "var(--color-white)",
        color: "var(--color-brand-dark-blue)",
        border: "2px solid var(--color-brand-dark-blue)",
      };
    case "danger":
      return {
        backgroundColor: "var(--color-danger)",
        color: "var(--color-white)",
        border: "2px solid var(--color-danger)",
      };
    case "ghost":
      return {
        backgroundColor: "transparent",
        color: "var(--color-brand-dark-blue)",
        border: "2px solid transparent",
      };
    case "header":
      return {
        backgroundColor: active ? "rgba(255,255,255,0.18)" : "transparent",
        color: "var(--color-white)",
        border: "1px solid rgba(255,255,255,0.4)",
        fontWeight: "var(--font-weight-medium)",
        letterSpacing: "normal",
      };
  }
}

function sizeStyle(size: Size): CSSProperties {
  switch (size) {
    case "xs":
      return {
        padding: "var(--space-1) var(--space-3)",
        fontSize: "12px",
      };
    case "sm":
      return {
        padding: "var(--space-1) var(--space-3)",
        fontSize: "var(--font-size-sm)",
      };
    case "md":
      return {
        padding: "var(--space-2) var(--space-4)",
        fontSize: "var(--font-size-body)",
      };
    case "lg":
      return {
        padding: "var(--space-3) var(--space-6)",
        fontSize: "var(--font-size-md)",
      };
  }
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    active = false,
    children,
    disabled,
    style,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled}
      aria-pressed={variant === "header" ? active : rest["aria-pressed"]}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-2)",
        fontFamily: "var(--font-family)",
        fontWeight: "var(--font-weight-bold)",
        letterSpacing: "0.02em",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background-color var(--transition-fast)",
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...variantStyle(variant, active),
        ...sizeStyle(size),
        ...style,
      }}
    >
      {children}
    </button>
  );
});
