import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PartyBadge } from "../../src/shared/PartyBadge";

describe("PartyBadge", () => {
  it("renders the party name", () => {
    render(<PartyBadge name="Peer Co" slug="peer-co" />);
    expect(screen.getByLabelText("Party: Peer Co")).toHaveTextContent("Peer Co");
  });

  it("exposes the slug as data-slug", () => {
    render(<PartyBadge name="Peer Research" slug="peer-research" />);
    expect(
      screen.getByLabelText("Party: Peer Research").getAttribute("data-slug"),
    ).toBe(
      "peer-research",
    );
  });

  it("assigns different tints to different slugs", () => {
    const { rerender } = render(<PartyBadge name="A" slug="aaa" />);
    const a = screen.getByLabelText("Party: A").style.backgroundColor;
    rerender(<PartyBadge name="B" slug="zzz" />);
    const b = screen.getByLabelText("Party: B").style.backgroundColor;
    expect(a).not.toEqual(b);
  });

  it("assigns the same tint deterministically for the same slug", () => {
    const { unmount } = render(<PartyBadge name="X" slug="peer-co" />);
    const first = screen.getByLabelText("Party: X").style.backgroundColor;
    unmount();
    render(<PartyBadge name="X" slug="peer-co" />);
    const second = screen.getByLabelText("Party: X").style.backgroundColor;
    expect(second).toEqual(first);
  });

  it("uses smaller padding when size=sm", () => {
    render(<PartyBadge name="S" slug="s" size="sm" />);
    expect(screen.getByLabelText("Party: S").style.padding).toBe(
      "1px var(--space-2)",
    );
  });
});
