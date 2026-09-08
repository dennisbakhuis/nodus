/**
 * Unfold-to-level control for the radar's group filter.
 *
 * Two shapes, chosen by how deep the forest in front of the reader actually
 * is. Up to six levels a numbered button per level is the better control: one
 * click instead of a drag, the whole range visible at once, and each button
 * carrying its own level colour. Past six the buttons stop fitting a 200px
 * sidebar, so the same range becomes a track. The control grows with the data
 * rather than making every deployment live with the shape that suits the
 * deepest one.
 */

import { groupDepthColor } from "../tree/treeEncodings";

/** Above this many levels the buttons give way to a track. */
const INLINE_LEVEL_LIMIT = 6;

export function GroupDepthPicker({
  levels,
  active,
  onPick,
}: {
  levels: number;
  /** Applied level, or null once the reader has folded rows by hand. */
  active: number | null;
  onPick: (level: number) => void;
}) {
  if (levels <= INLINE_LEVEL_LIMIT) {
    return (
      <span
        style={{
          display: "flex",
          gap: 2,
          alignItems: "center",
          margin: "2px 0 4px",
        }}
        title="Unfold the tree up to this level"
      >
        {Array.from({ length: levels }, (_, i) => i + 1).map((level) => {
          const levelColor = groupDepthColor(level - 1);
          const levelActive = active === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onPick(level)}
              aria-label={`Expand to level ${level}`}
              aria-pressed={levelActive}
              title={`Unfold to level ${level}`}
              style={{
                width: 18,
                height: 18,
                padding: 0,
                border: `1px solid ${levelColor}`,
                borderRadius: 4,
                background: levelActive ? levelColor : "var(--color-white)",
                color: levelActive ? "var(--color-white)" : levelColor,
                fontSize: 10,
                fontWeight: "var(--font-weight-bold)",
                lineHeight: 1,
                cursor: "pointer",
                fontFamily: "var(--font-family)",
              }}
            >
              {level}
            </button>
          );
        })}
      </span>
    );
  }

  // A hand-folded tree matches no level, but the track still has to sit
  // somewhere — park it on the last level applied and say it is no longer
  // what you are looking at.
  const position = active ?? 1;
  const readout =
    active === null
      ? "Unfolded by hand"
      : active >= levels
        ? `All ${levels} levels`
        : `Level ${active} of ${levels}`;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        margin: "2px 0 6px",
      }}
    >
      <span
        style={{
          fontSize: "var(--font-size-xs)",
          fontWeight: "var(--font-weight-medium)",
          color:
            active === null
              ? "var(--color-muted-text)"
              : groupDepthColor(position - 1),
        }}
      >
        {readout}
      </span>
      <input
        type="range"
        min={1}
        max={levels}
        step={1}
        value={position}
        aria-label="Unfold the group tree to this level"
        aria-valuetext={readout}
        onChange={(e) => onPick(Number(e.target.value))}
        style={{
          width: "100%",
          minWidth: 0,
          accentColor: groupDepthColor(position - 1),
        }}
      />
    </div>
  );
}
