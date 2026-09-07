/**
 * SVG renderer for both tree modes.
 *
 * The column caption rail is HTML positioned outside the zoom group, not
 * `<text>` inside it: captions must stay pinned and legible while a tall
 * column is panned, and in-SVG text at minimum zoom is unreadable. It tracks
 * the canvas by projecting each column's x through the same zoom/translate
 * state that drives the group transform.
 */

import { useImperativeHandle, type Ref } from "react";
import { RELATION_STROKES } from "../radar/encodings";
import { themeByKey } from "../radar/segmentThemes";
import type { RadarData } from "../radar/types";
import type { PositionedNode, TreeLayout } from "./layout";
import { NODE_MARKS, groupDepthColor } from "./treeEncodings";
import { usePanZoom, type TreeViewControls } from "./usePanZoom";

type Props = {
  layout: TreeLayout;
  data: RadarData;
  selectedTopicId: string | null;
  anchorTopicId: string | null;
  onSelect: (node: PositionedNode) => void;
  onAnchor: (node: PositionedNode) => void;
  onZoomChange?: (zoom: number, fitZoom: number) => void;
  controlsRef?: Ref<TreeViewControls | null>;
};

const STROKE_BY_KIND = {
  drives: RELATION_STROKES.drives,
  hinders: RELATION_STROKES.hinders,
  relates: RELATION_STROKES.relates_to,
};

function nodeFill(node: PositionedNode, data: RadarData): string {
  if (!node.entry) return "transparent";
  const segment = data.segments.find((s) => s.id === node.entry?.segment_id);
  return themeByKey(segment?.theme_key).dot;
}

export function TreeView({
  layout,
  data,
  selectedTopicId,
  anchorTopicId,
  onSelect,
  onAnchor,
  onZoomChange,
  controlsRef,
}: Props) {
  const fitKey = `${layout.nodes.length}:${layout.width}:${layout.height}:${layout.columns.length}`;
  const { wrapperRef, rootGRef, zoom, translate, isDragging, controls } =
    usePanZoom({ fitKey, onZoomChange });

  useImperativeHandle(controlsRef, () => controls, [controls]);

  return (
    <div
      ref={wrapperRef}
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "var(--color-page-background)",
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{ display: "block", overflow: "hidden" }}
        aria-label="Technology tree"
        role="img"
      >
        <defs>
          {Object.entries(STROKE_BY_KIND).map(([kind, stroke]) => (
            <marker
              key={kind}
              id={`tree-arrow-${kind}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke.color} />
            </marker>
          ))}
        </defs>

        <g ref={rootGRef}>
          <g>
            {layout.columns.map((column) => (
              <line
                key={column.level}
                x1={column.x}
                x2={column.x}
                y1={-layout.height / 2 - 40}
                y2={layout.height / 2 + 40}
                stroke="var(--color-ring-boundary)"
                strokeWidth={1}
                opacity={0.35}
              />
            ))}
          </g>

          <g>
            {layout.links.map((edge) => {
              const stroke = STROKE_BY_KIND[edge.kind];
              return (
                <path
                  key={`${edge.from}-${edge.to}-${edge.kind}`}
                  d={edge.path}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={edge.back ? 1 : 1.5}
                  strokeDasharray={edge.back ? "4,3" : stroke.dash}
                  opacity={edge.back ? 0.4 : 0.75}
                  markerEnd={
                    edge.back ? undefined : `url(#tree-arrow-${edge.kind})`
                  }
                />
              );
            })}
          </g>

          <g>
            {layout.nodes.map((node) => (
              <TreeNodeMark
                key={node.topicId}
                node={node}
                fill={nodeFill(node, data)}
                selected={node.topicId === selectedTopicId}
                anchored={node.topicId === anchorTopicId}
                onSelect={onSelect}
                onAnchor={onAnchor}
              />
            ))}
          </g>
        </g>
      </svg>

      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {layout.columns.map((column) => (
          <div
            key={column.level}
            style={{
              position: "absolute",
              left: translate.x + zoom * column.x,
              top: 8,
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              fontSize: "11px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-muted-text)",
              fontFamily: "var(--font-family)",
            }}
          >
            {column.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeNodeMark({
  node,
  fill,
  selected,
  anchored,
  onSelect,
  onAnchor,
}: {
  node: PositionedNode;
  fill: string;
  selected: boolean;
  anchored: boolean;
  onSelect: (node: PositionedNode) => void;
  onAnchor: (node: PositionedNode) => void;
}) {
  const mark = NODE_MARKS[node.kind];
  const accent = groupDepthColor(Math.abs(node.level));
  const dimmed = node.connector;

  return (
    <g
      data-topic-id={node.topicId}
      data-kind={node.kind}
      transform={`translate(${node.x}, ${node.y})`}
      opacity={dimmed ? 0.45 : 1}
      style={{ cursor: "pointer" }}
      tabIndex={0}
      role="button"
      aria-label={node.name}
      onClick={() => onSelect(node)}
      onDoubleClick={() => onAnchor(node)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node);
        }
      }}
    >
      {anchored && (
        <circle
          r={mark.radius + 7}
          fill="none"
          stroke="var(--color-brand-orange)"
          strokeWidth={2}
        />
      )}
      {selected && !anchored && (
        <circle
          r={mark.radius + 5}
          fill="none"
          stroke="var(--color-brand-bright-blue)"
          strokeWidth={2}
        />
      )}

      {mark.outerRadius !== null && (
        <circle
          r={mark.outerRadius}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
        />
      )}

      {mark.square ? (
        <rect
          x={-mark.radius}
          y={-mark.radius}
          width={mark.radius * 2}
          height={mark.radius * 2}
          rx={3}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
          strokeDasharray="3,2"
        />
      ) : (
        <circle
          r={mark.radius}
          fill={mark.filled ? fill : "none"}
          stroke="var(--color-white)"
          strokeWidth={1}
        />
      )}

      <text
        x={mark.outerRadius !== null ? mark.outerRadius + 6 : mark.radius + 6}
        y={4}
        fontSize={12}
        fontWeight={
          mark.bold ? "var(--font-weight-bold)" : "var(--font-weight-medium)"
        }
        fill={
          node.kind === "labelGroup"
            ? "var(--color-muted-text)"
            : "var(--color-dark-text)"
        }
        style={{
          textTransform: node.kind === "labelGroup" ? "uppercase" : "none",
          letterSpacing: node.kind === "labelGroup" ? "0.04em" : "normal",
        }}
      >
        {node.name}
      </text>
    </g>
  );
}
