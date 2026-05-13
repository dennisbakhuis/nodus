import { useState } from "react";

export function NodusFooterLink() {
  const [hover, setHover] = useState(false);
  return (
    <a
      href="https://github.com/dennisbakhuis/nodus"
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`Nodus v${__APP_VERSION__} on GitHub (opens in new tab)`}
      style={{
        flexShrink: 0,
        padding: "var(--space-2) var(--space-3)",
        borderTop: "1px solid var(--color-ring-boundary)",
        background: "var(--color-white)",
        fontSize: "10px",
        color: hover ? "var(--color-brand-orange)" : "var(--color-muted-text)",
        textAlign: "center",
        fontFamily: "var(--font-family)",
        textDecoration: "none",
        display: "block",
        letterSpacing: hover ? "0.08em" : "0.02em",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition:
          "color var(--transition-fast), letter-spacing var(--transition-fast), transform var(--transition-fast)",
        cursor: "pointer",
      }}
    >
      © Nodus 2026 · v{__APP_VERSION__}
    </a>
  );
}
