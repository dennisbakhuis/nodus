/**
 * Key to the tree canvas.
 *
 * The tree carries four encodings at once — shape says what kind of node it is,
 * fill says which segment it belongs to, the accent says which generation it
 * sits in, and stroke style says what a link means. Only the segment colours
 * appear anywhere else in the app, so without a key the other three are
 * guesswork.
 *
 * Marks are drawn from `NODE_MARKS` and `RELATION_STROKES` rather than
 * re-specified here, so a legend row cannot drift from the thing it explains.
 *
 * Folded by default: the canvas is the thing the reader came for, and a key
 * that covers the top-left corner of it on every visit earns its space only
 * once.
 */

import { useState } from "react";
import { RELATION_STROKES } from "../radar/encodings";
import { themeByKey } from "../radar/segmentThemes";
import type { RadarData } from "../radar/types";
import type { TreeLayout } from "./layout";
import { NODE_MARKS, groupDepthColor } from "./treeEncodings";
import type { TreeNodeKind } from "./groupForest";

type Props = {
  layout: TreeLayout;
  data: RadarData;
};

const NODE_ROWS: { kind: TreeNodeKind; label: string }[] = [
  { kind: "labelGroup", label: "Group — never on the radar" },
  { kind: "technologyGroup", label: "Technology that is also a group" },
  { kind: "technology", label: "Technology" },
];

const SECTION: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 6,
  borderTop: "1px dashed var(--color-ring-boundary)",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-muted-text)",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 4,
};

const TEXT: React.CSSProperties = { color: "var(--color-muted-text)" };

/** One node mark at legend scale, drawn the way the canvas draws it. */
function NodeMark({ kind }: { kind: TreeNodeKind }) {
  const mark = NODE_MARKS[kind];
  const accent = groupDepthColor(0);
  return (
    <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden>
      {mark.outerRadius !== null && (
        <circle
          r={mark.outerRadius * 0.7}
          fill="none"
          stroke={accent}
          strokeWidth={1.25}
        />
      )}
      {mark.square ? (
        <rect
          x={-mark.radius * 0.8}
          y={-mark.radius * 0.8}
          width={mark.radius * 1.6}
          height={mark.radius * 1.6}
          rx={2}
          fill={`color-mix(in srgb, ${accent} 12%, var(--color-white))`}
          stroke={accent}
          strokeWidth={1.25}
          strokeDasharray="3,2"
        />
      ) : (
        <circle
          r={mark.radius * 0.8}
          fill="var(--color-muted-text)"
          stroke="var(--color-white)"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}

export function TreeLegend({ layout, data }: Props) {
  const [open, setOpen] = useState(false);

  const levels = [...new Set(layout.nodes.map((n) => n.level))].sort(
    (a, b) => a - b,
  );
  const byDepth = layout.linkPalette === "depth";

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        top: 12,
        zIndex: 10,
        background: "var(--color-card-background, #fff)",
        border: "1px solid var(--color-ring-boundary, #ddd)",
        borderRadius: 6,
        overflow: "hidden",
        fontFamily: "var(--font-family)",
        fontSize: 11,
        minWidth: 150,
        maxWidth: 230,
        boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 10px",
          fontFamily: "var(--font-family)",
          fontSize: 11,
          fontWeight: "bold",
          color: "var(--color-dark-text)",
        }}
      >
        <span>Legend</span>
        <span style={{ marginLeft: 8, fontSize: 9 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "2px 10px 8px" }}>
          <div style={{ ...SECTION, marginTop: 4, borderTop: "none", paddingTop: 0 }}>
            Node
          </div>
          {NODE_ROWS.map((row) => (
            <div key={row.kind} style={ROW}>
              <NodeMark kind={row.kind} />
              <span style={TEXT}>{row.label}</span>
            </div>
          ))}

          <div style={SECTION}>Fill</div>
          {data.segments.map((segment) => {
            const theme = themeByKey(segment.theme_key);
            return (
              <div key={segment.id} style={ROW}>
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: theme.dot,
                    border: `1px solid ${theme.labelText}`,
                    flexShrink: 0,
                    marginLeft: 5,
                  }}
                />
                <span style={TEXT}>{segment.name}</span>
              </div>
            );
          })}
          <div style={ROW}>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "transparent",
                border: "1px solid var(--color-muted-text)",
                flexShrink: 0,
                marginLeft: 5,
              }}
            />
            <span style={TEXT}>Not on the radar</span>
          </div>

          {byDepth ? (
            <>
              <div style={SECTION}>
                {layout.shape === "radial" ? "Ring" : "Column"} — level
              </div>
              <div style={{ ...ROW, flexWrap: "wrap", gap: 4 }}>
                {levels.map((level) => (
                  <span
                    key={level}
                    title={`Level ${level + 1}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 18,
                      height: 16,
                      borderRadius: 3,
                      border: `2px solid ${groupDepthColor(level)}`,
                      color: groupDepthColor(level),
                      fontSize: 9,
                      fontWeight: "bold",
                    }}
                  >
                    {level + 1}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={SECTION}>Links</div>
              {Object.entries(RELATION_STROKES).map(([type, stroke]) => (
                <div key={type} style={ROW}>
                  <svg width={24} height={14} aria-hidden>
                    <line
                      x1={0}
                      y1={7}
                      x2={24}
                      y2={7}
                      stroke={stroke.color}
                      strokeWidth={1.5}
                      strokeDasharray={stroke.dash}
                    />
                  </svg>
                  <span style={TEXT}>{stroke.label}</span>
                </div>
              ))}
              <div style={ROW}>
                <svg width={24} height={14} aria-hidden>
                  <line
                    x1={0}
                    y1={7}
                    x2={24}
                    y2={7}
                    stroke="var(--color-muted-text)"
                    strokeWidth={1.25}
                    strokeDasharray="1,5"
                    strokeLinecap="round"
                  />
                </svg>
                <span style={TEXT}>Same level, or closes a cycle</span>
              </div>
            </>
          )}

          <div style={SECTION}>State</div>
          <div style={ROW}>
            <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden>
              <circle
                r={7}
                fill="none"
                stroke={groupDepthColor(0)}
                strokeWidth={1.25}
                strokeDasharray="2,2"
              />
              <circle r={4.5} fill="var(--color-muted-text)" />
            </svg>
            <span style={TEXT}>Folded — has hidden children</span>
          </div>
          <div style={ROW}>
            <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden>
              <circle r={4.5} fill="var(--color-muted-text)" opacity={0.45} />
            </svg>
            <span style={TEXT}>Kept only to connect a match</span>
          </div>
        </div>
      )}
    </div>
  );
}
