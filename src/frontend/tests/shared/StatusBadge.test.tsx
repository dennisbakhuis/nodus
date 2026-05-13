import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "../../src/shared/StatusBadge";

describe("StatusBadge", () => {
  it("renders OnRadar with correct label", () => {
    render(<StatusBadge status="OnRadar" />);
    const badge = screen.getByLabelText("Status: On Radar");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("On Radar");
  });

  it("renders Backlog with correct label", () => {
    render(<StatusBadge status="Backlog" />);
    expect(screen.getByLabelText("Status: Backlog")).toBeInTheDocument();
  });

  it("renders Archive with correct label", () => {
    render(<StatusBadge status="Archive" />);
    expect(screen.getByLabelText("Status: Archive")).toBeInTheDocument();
  });

  it("OnRadar uses dark blue background", () => {
    render(<StatusBadge status="OnRadar" />);
    const badge = screen.getByLabelText("Status: On Radar");
    expect(badge.style.backgroundColor).toBe("var(--color-brand-dark-blue)");
    expect(badge.style.color).toBe("var(--color-white)");
  });

  it("renders unknown status without crashing", () => {
    render(<StatusBadge status="Unknown" />);
    expect(screen.getByLabelText("Status: Unknown")).toBeInTheDocument();
  });
});
