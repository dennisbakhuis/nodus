import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MovementIndicator } from "../../src/shared/MovementIndicator";

describe("MovementIndicator", () => {
  it("renders promoted movement with upward triangle", () => {
    render(<MovementIndicator movement="promoted" showLabel />);
    expect(screen.getByLabelText("Promoted (moved inward)")).toBeInTheDocument();
    expect(screen.getByText("Promoted")).toBeInTheDocument();
  });

  it("renders demoted movement with downward triangle", () => {
    render(<MovementIndicator movement="demoted" showLabel />);
    expect(screen.getByLabelText("Demoted (moved outward)")).toBeInTheDocument();
    expect(screen.getByText("Demoted")).toBeInTheDocument();
  });

  it("renders new movement", () => {
    render(<MovementIndicator movement="new" showLabel />);
    expect(screen.getByLabelText("New this cycle")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("renders unchanged by default", () => {
    render(<MovementIndicator movement="unchanged" showLabel />);
    expect(screen.getByLabelText("No change this cycle")).toBeInTheDocument();
  });

  it("does not render label when showLabel is false", () => {
    render(<MovementIndicator movement="new" />);
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(screen.getByLabelText("New this cycle")).toBeInTheDocument();
  });

  it("renders up as promoted", () => {
    render(<MovementIndicator movement="up" />);
    expect(screen.getByLabelText("Promoted (moved inward)")).toBeInTheDocument();
  });

  it("renders down as demoted", () => {
    render(<MovementIndicator movement="down" />);
    expect(screen.getByLabelText("Demoted (moved outward)")).toBeInTheDocument();
  });
});
