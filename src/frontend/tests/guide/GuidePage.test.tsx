import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { GuidePage } from "../../src/guide/GuidePage";

beforeAll(() => {
  // jsdom implements neither IntersectionObserver nor scrollIntoView.
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", IO);
  Element.prototype.scrollIntoView = vi.fn();
});

describe("GuidePage", () => {
  it("renders a chapter side-menu plus the rendered guide body", () => {
    render(<GuidePage />);

    const nav = screen.getByRole("navigation", { name: /guide chapters/i });
    const items = within(nav).getAllByRole("button");
    // One entry per ## chapter in the guide.
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(within(nav).getByText("The methodology")).toBeInTheDocument();
    expect(within(nav).getByText("Administration")).toBeInTheDocument();

    // The body renders the H1 and anchored chapter headings.
    expect(
      screen.getByRole("heading", { level: 1, name: /nodus/i }),
    ).toBeInTheDocument();
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "The methodology",
    });
    expect(heading).toHaveAttribute("id", "the-methodology");
  });

  it("marks a chapter active when clicked", () => {
    render(<GuidePage />);
    const nav = screen.getByRole("navigation", { name: /guide chapters/i });
    const roles = within(nav).getByRole("button", { name: "Roles & access" });
    fireEvent.click(roles);
    expect(roles).toHaveAttribute("aria-current", "true");
  });
});
