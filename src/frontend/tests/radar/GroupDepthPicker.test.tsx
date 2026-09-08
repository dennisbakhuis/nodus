import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupDepthPicker } from "../../src/radar/GroupDepthPicker";

describe("GroupDepthPicker", () => {
  it("gives a shallow forest one button per level", async () => {
    const onPick = vi.fn();
    render(<GroupDepthPicker levels={4} active={2} onPick={onPick} />);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByLabelText("Expand to level 2")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByLabelText("Expand to level 4"));
    expect(onPick).toHaveBeenCalledWith(4);
  });

  it("switches to a track once the buttons would stop fitting", () => {
    render(<GroupDepthPicker levels={9} active={3} onPick={vi.fn()} />);

    expect(screen.queryByLabelText("Expand to level 3")).toBeNull();
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuetext", "Level 3 of 9");
    expect(slider).toHaveAttribute("max", "9");
  });

  it("calls the top of the track 'all', not by its number", () => {
    render(<GroupDepthPicker levels={9} active={9} onPick={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "All 9 levels",
    );
  });

  it("says so when the tree no longer matches any level", () => {
    // `active` goes null as soon as a row is folded by hand. The track still
    // has to sit somewhere, but it must not claim to describe the tree.
    render(<GroupDepthPicker levels={9} active={null} onPick={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "Unfolded by hand",
    );
  });
});
