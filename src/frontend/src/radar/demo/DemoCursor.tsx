type Props = {
  x: number;
  y: number;
  visible: boolean;
  pulsing: boolean;
};

const CURSOR_SIZE = 24;
const PULSE_SIZE = 56;
const TRANSITION =
  "transform 800ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms";

/**
 * Fake mouse cursor rendered as a fixed overlay above the radar during
 * presentation mode. The pulse ring fires briefly on each simulated click.
 *
 * `pointer-events: none` keeps the real mouse uninterrupted — the overlay is
 * purely visual.
 */
export function DemoCursor({ x, y, visible, pulsing }: Props) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        transform: `translate3d(${x - CURSOR_SIZE / 2}px, ${y - CURSOR_SIZE / 2}px, 0)`,
        width: CURSOR_SIZE,
        height: CURSOR_SIZE,
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
        zIndex: "var(--z-tooltip)",
        transition: TRANSITION,
        willChange: "transform, opacity",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: PULSE_SIZE,
          height: PULSE_SIZE,
          marginTop: -PULSE_SIZE / 2,
          marginLeft: -PULSE_SIZE / 2,
          borderRadius: "50%",
          border: "3px solid var(--color-brand-orange)",
          opacity: pulsing ? 1 : 0,
          transform: pulsing ? "scale(1)" : "scale(0.25)",
          transition: pulsing
            ? "transform 350ms ease-out, opacity 350ms ease-out"
            : "none",
          pointerEvents: "none",
        }}
      />
      <svg
        width={CURSOR_SIZE}
        height={CURSOR_SIZE}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          inset: 0,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
        }}
      >
        <path
          d="M4 2 L4 18 L9 14 L12 21 L15 20 L12 13 L19 13 Z"
          fill="var(--color-white)"
          stroke="var(--color-brand-dark-blue)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
