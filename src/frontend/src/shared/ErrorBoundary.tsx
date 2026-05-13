import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Render-prop fallback so callers can theme the recovery card. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Reset key — when it changes, error state clears. Used by route-level
   * boundaries to recover automatically on navigation. */
  resetKey?: string | number;
  /** Logical name for the boundary, used in dev console output. */
  name?: string;
};

type State = {
  error: Error | null;
};

/**
 * React error boundary.
 *
 * Catches throws inside ``RadarView`` and other heavy components, logs
 * them, and renders a small recovery card with "Try again" and "Reload
 * page" actions instead of blanking the entire page.
 *
 * Two boundaries are wired in App.tsx:
 *
 * 1. A top-level one inside ``<Layout>`` — last-resort safety net.
 * 2. A route-level one inside ``<Routes>`` keyed on the current pathname,
 *    so a render error on /manage/users stays scoped to that route and
 *    auto-resets when the user navigates away.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const where = this.props.name ?? "(unnamed)";
    console.error(
      `ErrorBoundary[${where}] caught:`,
      error,
      "\nComponent stack:",
      info.componentStack,
    );
  }

  componentDidUpdate(prev: Props): void {
    if (
      this.state.error !== null &&
      prev.resetKey !== this.props.resetKey &&
      this.props.resetKey !== undefined
    ) {
      // Auto-reset when the resetKey changes — typically a route change.
      this.setState({ error: null });
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    if (this.props.fallback !== undefined) {
      return this.props.fallback(error, this.reset);
    }

    return <DefaultFallback error={error} onReset={this.reset} />;
  }
}

function DefaultFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        margin: "var(--space-6) auto",
        maxWidth: 560,
        padding: "var(--space-6)",
        background: "var(--color-white)",
        border: "1px solid var(--color-danger)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <h2
        style={{
          marginTop: 0,
          color: "var(--color-danger)",
          fontSize: "var(--font-size-md)",
        }}
      >
        Something went wrong
      </h2>
      <p
        style={{
          color: "var(--color-dark-text)",
          fontSize: "var(--font-size-body)",
        }}
      >
        The page couldn't render. Try the button below; if it keeps happening,
        reload the browser tab and report the error to the radar team.
      </p>
      <details
        style={{
          marginBottom: "var(--space-4)",
          fontSize: "var(--font-size-sm)",
          color: "var(--color-muted-text)",
        }}
      >
        <summary style={{ cursor: "pointer" }}>Technical details</summary>
        <pre
          style={{
            marginTop: "var(--space-2)",
            padding: "var(--space-2)",
            background: "var(--color-page-background)",
            borderRadius: "var(--radius-sm)",
            overflow: "auto",
            fontSize: "var(--font-size-xs)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.name}: {error.message}
          {error.stack !== undefined ? "\n\n" + error.stack : ""}
        </pre>
      </details>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={onReset}
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--color-brand-dark-blue)",
            color: "var(--color-white)",
            border: "2px solid var(--color-brand-dark-blue)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontWeight: "var(--font-weight-bold)",
          }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--color-white)",
            color: "var(--color-brand-dark-blue)",
            border: "2px solid var(--color-brand-dark-blue)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontWeight: "var(--font-weight-bold)",
          }}
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
