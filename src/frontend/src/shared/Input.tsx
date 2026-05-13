import { type InputHTMLAttributes, useId } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({
  label,
  error,
  disabled,
  id: idProp,
  style,
  ...rest
}: Props) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const errorId = `${id}-error`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      <label
        htmlFor={id}
        style={{
          fontSize: "var(--font-size-sm)",
          fontWeight: "var(--font-weight-medium)",
          color: disabled
            ? "var(--color-muted-text)"
            : "var(--color-dark-text)",
        }}
      >
        {label}
      </label>
      <input
        {...rest}
        id={id}
        disabled={disabled}
        aria-invalid={error != null ? true : undefined}
        aria-describedby={error != null ? errorId : undefined}
        style={{
          height: "36px",
          padding: "0 var(--space-3)",
          border: `1px solid ${error != null ? "var(--color-danger)" : "var(--color-border-strong)"}`,
          borderRadius: "var(--radius-md)",
          fontSize: "var(--font-size-body)",
          color: "var(--color-dark-text)",
          backgroundColor: disabled
            ? "var(--color-hover-bg)"
            : "var(--color-white)",
          cursor: disabled ? "not-allowed" : "text",
          transition: "border-color var(--transition-fast)",
          width: "100%",
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor =
            error != null
              ? "var(--color-danger)"
              : "var(--color-brand-dark-blue)";
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor =
            error != null
              ? "var(--color-danger)"
              : "var(--color-border-strong)";
          rest.onBlur?.(e);
        }}
      />
      {error != null && (
        <span
          id={errorId}
          role="alert"
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
