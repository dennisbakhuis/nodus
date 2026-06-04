import { useEffect, useMemo, useRef, useState } from "react";
import { HelpMarkdown, slugifyHeading } from "../help/HelpMarkdown";
import source from "./content/methodology.md?raw";

type Chapter = { id: string; title: string; level: 2 | 3 };

/** Parse `##` / `###` headings from the markdown into a flat chapter list. */
function parseChapters(md: string): Chapter[] {
  const chapters: Chapter[] = [];
  for (const raw of md.split("\n")) {
    const m = /^(#{2,3})\s+(.*)$/.exec(raw.trim());
    if (!m) continue;
    const hashes = m[1] ?? "";
    const title = (m[2] ?? "").trim();
    if (!title) continue;
    chapters.push({
      id: slugifyHeading(title),
      title,
      level: hashes.length === 2 ? 2 : 3,
    });
  }
  return chapters;
}

export function GuidePage() {
  const chapters = useMemo(() => parseChapters(source), []);
  const [activeId, setActiveId] = useState<string>(chapters[0]?.id ?? "");
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const headings = chapters
      .map((c) => root.querySelector<HTMLElement>(`#${CSS.escape(c.id)}`))
      .filter((el): el is HTMLElement => el != null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // When scrolled to the bottom, a short final chapter can't reach the
        // detection band — highlight it explicitly so the menu stays in sync.
        if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
          const last = headings[headings.length - 1];
          if (last) setActiveId(last.id);
          return;
        }
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));

    const onScroll = () => {
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        const last = headings[headings.length - 1];
        if (last) setActiveId(last.id);
      }
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, [chapters]);

  // Keep the highlighted entry visible by nudging only the nav's own scroll.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !activeId) return;
    const btn = nav.querySelector<HTMLElement>(
      `[data-chapter-id="${CSS.escape(activeId)}"]`,
    );
    if (!btn) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const margin = 8;
    if (btnRect.top < navRect.top + margin) {
      nav.scrollTop -= navRect.top + margin - btnRect.top;
    } else if (btnRect.bottom > navRect.bottom - margin) {
      nav.scrollTop += btnRect.bottom - (navRect.bottom - margin);
    }
  }, [activeId]);

  function goTo(id: string) {
    const root = contentRef.current;
    const el = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        gap: "var(--space-6)",
        width: "100%",
      }}
    >
      <nav
        ref={navRef}
        aria-label="Guide chapters"
        style={{
          flex: "0 0 220px",
          alignSelf: "flex-start",
          maxHeight: "100%",
          overflowY: "auto",
          paddingRight: "var(--space-2)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {chapters.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-chapter-id={c.id}
                  onClick={() => goTo(c.id)}
                  aria-current={active ? "true" : undefined}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: active
                      ? "color-mix(in srgb, var(--color-brand-dark-blue) 10%, var(--color-white))"
                      : "transparent",
                    border: "none",
                    borderLeft: active
                      ? "3px solid var(--color-brand-orange)"
                      : "3px solid transparent",
                    cursor: "pointer",
                    padding: "6px 10px",
                    paddingLeft:
                      c.level === 3 ? "calc(10px + var(--space-4))" : "10px",
                    fontFamily: "var(--font-family)",
                    fontSize:
                      c.level === 3
                        ? "var(--font-size-sm)"
                        : "var(--font-size-body)",
                    fontWeight: active
                      ? "var(--font-weight-bold)"
                      : "var(--font-weight-regular)",
                    color: active
                      ? "var(--color-brand-dark-blue)"
                      : "var(--color-dark-text)",
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                  }}
                >
                  {c.title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        ref={contentRef}
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          paddingRight: "var(--space-4)",
        }}
      >
        <div style={{ maxWidth: 760 }}>
          <HelpMarkdown source={source} withAnchors />
        </div>
      </div>
    </div>
  );
}
