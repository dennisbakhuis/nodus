import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useHelp } from "./HelpContext";
import { HelpMarkdown } from "./HelpMarkdown";
import { routeToHelp } from "./routeToHelp";

const docs = import.meta.glob("./content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function loadContent(slug: string): string {
  const key = `./content/${slug}.md`;
  return (
    docs[key] ??
    docs["./content/default.md"] ??
    "# Help\n\nNo help content available for this page yet."
  );
}

const HEADER_HEIGHT = 56;
const PANEL_WIDTH = 440;
const MOBILE_BREAKPOINT = 640;

export function HelpPanel() {
  const { open, setOpen, triggerRef } = useHelp();
  const location = useLocation();
  const panelRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openLocationKeyRef = useRef<string | null>(null);
  const wasOpenRef = useRef(false);

  const { slug, title } = routeToHelp(location.pathname);
  const source = loadContent(slug);

  useEffect(() => {
    if (open) {
      if (openLocationKeyRef.current === null) {
        openLocationKeyRef.current = location.key;
      } else if (openLocationKeyRef.current !== location.key) {
        setOpen(false);
      }
    } else {
      openLocationKeyRef.current = null;
    }
  }, [open, location.key, setOpen]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const t = window.setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(t);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
    return undefined;
  }, [open, triggerRef]);

  if (!open) return null;

  return (
    <>
      <div
        className="help-panel__backdrop"
        aria-hidden="true"
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          top: HEADER_HEIGHT,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          zIndex: "var(--z-modal, 1000)",
          display: "none",
        }}
      />
      <aside
        ref={panelRef}
        className="help-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="help-panel-title"
        style={{
          position: "fixed",
          top: HEADER_HEIGHT,
          right: 0,
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
          width: PANEL_WIDTH,
          maxWidth: "100vw",
          backgroundColor: "var(--color-white)",
          boxShadow: "var(--shadow-panel)",
          borderLeft: "1px solid var(--color-border, #e5e5e5)",
          display: "flex",
          flexDirection: "column",
          zIndex: "var(--z-modal, 1000)",
          animation: "help-panel-slide-in 180ms ease-out",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--space-4) var(--space-5)",
            backgroundColor: "var(--color-brand-dark-blue)",
            color: "var(--color-white)",
            flexShrink: 0,
          }}
        >
          <h2
            id="help-panel-title"
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-white)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close help"
            style={{
              background: "none",
              border: "none",
              color: "var(--color-white)",
              fontSize: "var(--font-size-xl)",
              cursor: "pointer",
              lineHeight: 1,
              width: 36,
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-md)",
              transition: "background-color var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            ✕
          </button>
        </header>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-5) var(--space-5)",
          }}
        >
          <HelpMarkdown source={source} />
        </div>
      </aside>
      <style>{`
        @keyframes help-panel-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (max-width: ${MOBILE_BREAKPOINT}px) {
          .help-panel { width: 100vw !important; }
          .help-panel__backdrop { display: block !important; }
        }
      `}</style>
    </>
  );
}
