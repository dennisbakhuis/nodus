/**
 * Holding pen for technologies that belong to no group.
 *
 * These have nothing tree-like to show. Drawn as depth-0 roots they sit in the
 * same column as real roots and drown them — half the population can arrive
 * this way — but dropping them silently hides real data. The tray keeps them
 * one click away, on the canvas, without letting them pose as a generation.
 */

import { useState } from "react";
import { themeByKey } from "../radar/segmentThemes";
import type { RadarData, RadarEntry } from "../radar/types";
import type { GroupNode } from "./groupForest";

type Props = {
  nodes: GroupNode[];
  data: RadarData;
  onSelect: (entry: RadarEntry) => void;
};

export function UngroupedTray({ nodes, data, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  if (nodes.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: "var(--color-white)",
        borderTop: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-md)",
        fontFamily: "var(--font-family)",
        maxHeight: "40%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          padding: "6px 12px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          font: "inherit",
          fontSize: "11px",
          fontWeight: "var(--font-weight-bold)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-muted-text)",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 120ms ease",
          }}
        >
          ▸
        </span>
        Ungrouped ({nodes.length})
      </button>

      {open && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-1)",
            padding: "0 12px 10px",
            overflowY: "auto",
          }}
        >
          {nodes.map((node) => {
            const segment = data.segments.find(
              (s) => s.id === node.entry?.segment_id,
            );
            const theme = themeByKey(segment?.theme_key);
            return (
              <button
                key={node.topicId}
                type="button"
                onClick={() => node.entry && onSelect(node.entry)}
                title={node.name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 9px",
                  borderRadius: 999,
                  border: `1px solid ${theme.sliceStroke}`,
                  background: theme.chipBg,
                  color: theme.chipText,
                  fontSize: "var(--font-size-xs)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: theme.dot,
                    flexShrink: 0,
                  }}
                />
                {node.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
