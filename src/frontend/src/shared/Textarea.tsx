import { type TextareaHTMLAttributes, useId } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

export function Textarea({
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
      <textarea
        {...rest}
        id={id}
        disabled={disabled}
        aria-invalid={error != null ? true : undefined}
        aria-describedby={error != null ? errorId : undefined}
        style={{
          padding: "var(--space-2) var(--space-3)",
          border: `1px solid ${error != null ? "var(--color-danger)" : "var(--color-border-strong)"}`,
          borderRadius: "var(--radius-md)",
          fontSize: "var(--font-size-body)",
          color: "var(--color-dark-text)",
          backgroundColor: disabled
            ? "var(--color-hover-bg)"
            : "var(--color-white)",
          cursor: disabled ? "not-allowed" : "text",
          resize: "vertical",
          minHeight: "80px",
          width: "100%",
          fontFamily: "var(--font-family)",
          lineHeight: "var(--line-height-body)",
          transition: "border-color var(--transition-fast)",
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
