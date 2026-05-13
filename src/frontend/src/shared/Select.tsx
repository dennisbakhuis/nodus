import { type SelectHTMLAttributes, useId } from "react";

type Option = {
  value: string;
  label: string;
};

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
  error?: string;
};

export function Select({
  label,
  options,
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
      <select
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
          cursor: disabled ? "not-allowed" : "pointer",
          appearance: "none",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23003584' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right var(--space-3) center",
          paddingRight: "var(--space-8)",
          width: "100%",
          ...style,
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
