import { type ReactNode, useId } from "react";

type RenderProps = {
  /** Pass to the wrapped input/select/textarea so the label associates correctly. */
  id: string;
  /** Pass as `aria-describedby` so screen readers narrate helper text and errors. */
  describedBy?: string;
  /** Pass as `aria-invalid` when the field is in error. */
  invalid?: boolean;
  /** Pass as `aria-required` for required fields. */
  required?: boolean;
};

type Props = {
  label: string;
  /** Children get an `{id, describedBy, invalid, required}` argument to wire
   * up accessibility attributes on the inner control. */
  children: (renderProps: RenderProps) => ReactNode;
  required?: boolean;
  helper?: string;
  error?: string;
  /** When true, place label above the control (default). When false, place
   * label and control side-by-side (used by the radar filter rail). */
  stacked?: boolean;
};

/**
 * Shared form-field wrapper.
 *
 * Field generates the id once via useId, exposes it to the inner control
 * via render-props, and threads error / helper text into aria-describedby
 * so screen-reader users hear validation feedback.
 *
 * Usage:
 *
 *   <Field label="Username" required error={error?.username}>
 *     {({ id, describedBy, invalid, required }) => (
 *       <input id={id} aria-describedby={describedBy}
 *              aria-invalid={invalid} aria-required={required} ... />
 *     )}
 *   </Field>
 */
export function Field({
  label,
  children,
  required = false,
  helper,
  error,
  stacked = true,
}: Props) {
  const id = useId();
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  // Compose aria-describedby from whichever auxiliary text is present.
  const descriptors = [
    helper != null ? helperId : null,
    error != null ? errorId : null,
  ]
    .filter((s): s is string => s !== null)
    .join(" ");
  const describedBy = descriptors.length > 0 ? descriptors : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "stretch" : "center",
        gap: stacked ? "var(--space-1)" : "var(--space-3)",
      }}
    >
      <label
        htmlFor={id}
        style={{
          fontSize: "var(--font-size-sm)",
          fontWeight: "var(--font-weight-medium)",
          color: "var(--color-dark-text)",
          flexShrink: 0,
        }}
      >
        {label}
        {required && (
          <span
            aria-hidden="true"
            style={{ color: "var(--color-danger)", marginLeft: 2 }}
          >
            *
          </span>
        )}
      </label>
      {children({
        id,
        describedBy,
        invalid: error != null,
        required: required || undefined,
      })}
      {helper != null && error == null && (
        <span
          id={helperId}
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-muted-text)",
          }}
        >
          {helper}
        </span>
      )}
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
