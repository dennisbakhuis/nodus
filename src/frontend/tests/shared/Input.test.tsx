import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Input } from "../../src/shared/Input";

describe("Input", () => {
  it("renders with a label", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("associates label with input via id", () => {
    render(<Input label="Username" id="username-field" />);
    const input = screen.getByLabelText("Username");
    expect(input).toHaveAttribute("id", "username-field");
  });

  it("renders error message and marks input invalid", () => {
    render(<Input label="Email" error="Invalid email" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Input label="Field" disabled />);
    expect(screen.getByLabelText("Field")).toBeDisabled();
  });
});
