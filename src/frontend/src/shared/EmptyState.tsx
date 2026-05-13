/**
 * Shared empty/error state primitive.
 *
 * Centralizes the "nothing to show" / "request failed" full-panel message
 * so each page doesn't reinvent the same div-with-padding-and-centred-text.
 * For per-row "no data" inside a Table, prefer the existing Table
 * ``emptyMessage`` prop instead.
 */

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function EmptyState({ children }: Props) {
  return (
    <div
      role="status"
      style={{
        padding: "var(--space-8)",
        textAlign: "center",
        fontFamily: "var(--font-family)",
        color: "var(--color-dark-text)",
      }}
    >
      <p>{children}</p>
    </div>
  );
}
