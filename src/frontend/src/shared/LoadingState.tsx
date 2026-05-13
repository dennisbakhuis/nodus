/**
 * Shared loading indicator.
 *
 * Replaces the per-page `<div className={styles.loading}>Loading X…</div>`
 * boilerplate scattered through manage pages with a single primitive that
 * carries the canonical aria-live="polite" + role="status" semantics. Pages
 * that needed extra CSS hooks (CyclesPage's centered overlay) can opt into
 * the heavier variant via the `block` prop.
 */

import type { ReactNode } from "react";

type Props = {
  children?: ReactNode;
  block?: boolean;
};

export function LoadingState({ children = "Loading…", block }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        color: "var(--color-muted-text)",
        fontSize: "var(--font-size-body)",
        padding: block ? "var(--space-6) var(--space-4)" : "var(--space-4)",
        textAlign: block ? "center" : "left",
      }}
    >
      {children}
    </div>
  );
}
