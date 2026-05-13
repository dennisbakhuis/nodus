import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RingBadge } from "../../src/shared/RingBadge";

describe("RingBadge", () => {
  const rings = ["Invest", "Pilot", "Explore", "Monitor"] as const;

  rings.forEach((ring) => {
    it(`renders ${ring} ring badge`, () => {
      render(<RingBadge ring={ring} />);
      const badge = screen.getByLabelText(`Ring: ${ring}`);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(ring);
    });
  });

  it("renders unknown ring gracefully", () => {
    render(<RingBadge ring="Unknown" />);
    expect(screen.getByLabelText("Ring: Unknown")).toBeInTheDocument();
  });

  it("Invest ring uses green color token", () => {
    render(<RingBadge ring="Invest" />);
    const badge = screen.getByLabelText("Ring: Invest");
    expect(badge.style.color).toBe("var(--color-ring-invest)");
  });

  it("Monitor ring uses red/watch color token", () => {
    render(<RingBadge ring="Monitor" />);
    const badge = screen.getByLabelText("Ring: Monitor");
    expect(badge.style.color).toBe("var(--color-ring-monitor)");
  });
});
