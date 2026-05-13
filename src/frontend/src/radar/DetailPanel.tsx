import { useEffect, useRef, useState } from "react";
import type { RadarEntry, RadarData, TechnologyRelation } from "./types";
import { getTopic } from "../api/client";
import { listMovements } from "../manage/api";
import { HeroImage } from "./HeroImage";
import { TopicView } from "../topic-detail/TopicView";
import type { TopicDetailNested } from "../topic-detail/types";
import { useAuth } from "../shared/AuthContext";
import { MovementIndicator } from "../shared/MovementIndicator";
import { themeByKey } from "./segmentThemes";

type Props = {
  entry: RadarEntry | null;
  data: RadarData;
  relations: TechnologyRelation[];
  onClose: () => void;
  onNavigate: (entry: RadarEntry) => void;
  onExpand?: () => void;
  disabled?: boolean;
};

type MovementEvent = {
  id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  rationale: string;
  timestamp: string;
};

const RING_BADGE_COLORS: Record<string, string> = {
  Invest: "var(--color-ring-invest)",
  Pilot: "var(--color-ring-trial)",
  Explore: "var(--color-ring-assess)",
  Monitor: "var(--color-ring-watch)",
};

export function DetailPanel({
  entry,
  data,
  relations,
  onClose,
  onNavigate,
  onExpand,
  disabled = false,
}: Props) {
  const { canOpenFullTopicModal: canExpand } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState<TopicDetailNested | null>(null);
  const [movements, setMovements] = useState<MovementEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!entry) return;
    window.history.replaceState({}, "", `/radar/${entry.slug}`);
    setLoading(true);
    setDetail(null);
    setMovements([]);

    const topicFetch = getTopic(entry.slug).then((d) =>
      // The PublicReader visibility config strips `persons` and
      // `recent_events` from the response, but TopicView (and the
      // TopicDetailNested type) treat them as required. Default both to
      // empty arrays so the renderer can read .length without guards.
      setDetail({
        ...d,
        persons: d.persons ?? [],
        recent_events: d.recent_events ?? [],
      } as unknown as TopicDetailNested),
    );
    const movFetch = entry.technology_id
      ? listMovements(entry.technology_id).then((m) =>
          setMovements(m as MovementEvent[]),
        )
      : Promise.resolve();

    Promise.all([topicFetch, movFetch])
      .catch(() => {
        setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [entry]);

  useEffect(() => {
    if (entry) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement;
      setTimeout(() => closeBtnRef.current?.focus(), 50);
    } else {
      previouslyFocusedRef.current?.focus();
    }
  }, [entry]);

  useEffect(() => {
    if (!entry || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.closest("[aria-hidden]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [entry, onClose, disabled]);

  const segment = entry
    ? data.segments.find((s) => s.id === entry.segment_id)
    : null;
  const ring = entry ? data.rings.find((r) => r.name === entry.ring) : null;

  const heroImageId = detail?.technology
    ? (detail.technology["hero_image_id"] as string | null | undefined)
    : null;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 76,
    right: 0,
    width: "clamp(320px, 420px, 520px)",
    height: "calc(100vh - 76px)",
    background: "var(--color-white)",
    border: "1px solid var(--color-white)",
    boxShadow: "var(--shadow-lg)",
    zIndex: 200,
    display: "flex",
    flexDirection: "column",
    transform: entry ? "translateX(0)" : "translateX(100%)",
    transition: "transform 300ms ease-out",
    fontFamily: "var(--font-family)",
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    zIndex: 199,
    opacity: entry ? 1 : 0,
    pointerEvents: entry ? "auto" : "none",
    transition: "opacity 300ms ease-out",
  };

  return (
    <>
      <div style={overlayStyle} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={entry?.canonical_name ?? "Topic detail"}
        style={panelStyle}
      >
        <div style={{ position: "relative", flexShrink: 0 }}>
          <HeroImage
            heroImageId={heroImageId}
            altText={entry?.canonical_name}
          />
          {ring && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                zIndex: 1,
              }}
            >
              <span
                style={{
                  background:
                    RING_BADGE_COLORS[ring.name] ?? "var(--color-dark-blue)",
                  color: "white",
                  fontSize: "11px",
                  padding: "3px 10px",
                  borderRadius: "10px",
                  fontWeight: "var(--font-weight-bold)",
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                }}
              >
                {ring.name}
              </span>
            </div>
          )}
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "flex",
              gap: "6px",
              zIndex: 1,
            }}
          >
            {onExpand && entry && canExpand && (
              <button
                onClick={onExpand}
                aria-label="Open full detail view"
                title="Open full detail view"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "var(--color-white)",
                  cursor: "pointer",
                  fontSize: 13,
                  lineHeight: 1,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  fontWeight: "var(--font-weight-medium)",
                  fontFamily: "var(--font-family)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  backdropFilter: "blur(4px)",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(0,0,0,0.7)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(0,0,0,0.5)";
                }}
              >
                ⛶ Open
              </button>
            )}
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Close detail panel"
              style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "var(--color-white)",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: "4px 9px",
                borderRadius: "6px",
                flexShrink: 0,
                backdropFilter: "blur(4px)",
                transition: "background 150ms",
                outline: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(0,0,0,0.7)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(0,0,0,0.5)";
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand-dark-blue) 0%, color-mix(in srgb, var(--color-brand-dark-blue) 65%, var(--color-brand-bright-blue)) 100%)",
            color: "var(--color-white)",
            padding: "var(--space-4) var(--space-5)",
            flexShrink: 0,
            borderBottom: "3px solid rgba(255,255,255,0.15)",
          }}
        >
          <h2
            style={{
              margin: 0,
              marginBottom: "var(--space-2)",
              fontSize: "1.4rem",
              fontWeight: "var(--font-weight-bold)",
              lineHeight: 1.25,
              letterSpacing: "-0.01em",
              color: "#ffffff",
            }}
          >
            {entry?.canonical_name ?? ""}
          </h2>

          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              marginTop: "var(--space-1)",
            }}
          >
            {segment &&
              (() => {
                const theme = themeByKey(segment.theme_key);
                return (
                  <span
                    style={{
                      background: theme.chipBg,
                      color: theme.chipText,
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "10px",
                      border: `1px solid ${theme.sliceStroke}`,
                      fontWeight: "var(--font-weight-medium)",
                    }}
                  >
                    {segment.name}
                  </span>
                );
              })()}
            {entry?.movement && entry.movement !== "unchanged" && (
              <span
                style={{
                  background: "rgba(255,255,255,0.85)",
                  fontSize: "11px",
                  padding: "3px 10px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <MovementIndicator
                  movement={entry.movement}
                  showLabel
                  style={{ fontSize: "11px", gap: 4 }}
                />
              </span>
            )}
            {detail &&
              (() => {
                const norm = (s: string) =>
                  s
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "")
                    .trim();
                const excluded = norm(entry?.canonical_name ?? "");
                const seen = new Set<string>();
                const visible = detail.aliases.filter((a) => {
                  const n = norm(a.alias_name);
                  if (!n || n === excluded || seen.has(n)) return false;
                  seen.add(n);
                  return true;
                });
                const ALIAS_CAP = 3;
                const shown = visible.slice(0, ALIAS_CAP);
                const overflow = visible.length - shown.length;
                const chipStyle = {
                  fontSize: "12px",
                  padding: "3px 10px",
                  borderRadius: "10px",
                  background: "rgba(255,255,255,0.16)",
                  color: "rgba(255,255,255,0.92)",
                  border: "1px solid rgba(255,255,255,0.24)",
                } as const;
                return (
                  <>
                    {shown.map((a) => (
                      <span key={a.alias_name} style={chipStyle}>
                        {a.alias_name}
                      </span>
                    ))}
                    {overflow > 0 && (
                      <span
                        style={chipStyle}
                        title={visible
                          .slice(ALIAS_CAP)
                          .map((a) => a.alias_name)
                          .join(", ")}
                      >
                        +{overflow} more
                      </span>
                    )}
                  </>
                );
              })()}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-5) var(--space-5) var(--space-6)",
          }}
        >
          {loading && (
            <p
              style={{ color: "var(--color-muted-text)", fontStyle: "italic" }}
            >
              Loading…
            </p>
          )}

          {detail && entry && (
            <TopicView
              detail={detail}
              radarContext={{ entry, data, relations, onNavigate }}
              showHeaderBadges={false}
              showHeroImage={false}
              movements={movements}
            />
          )}
        </div>
      </div>
    </>
  );
}
