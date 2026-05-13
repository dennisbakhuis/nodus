import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Select } from "../../src/shared/Select";

const OPTIONS = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

describe("Select", () => {
  it("renders with label and options", () => {
    render(<Select label="Category" options={OPTIONS} />);
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    OPTIONS.forEach((opt) => expect(screen.getByRole("option", { name: opt.label })).toBeInTheDocument());
  });

  it("renders error message", () => {
    render(<Select label="Type" options={OPTIONS} error="Required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(screen.getByLabelText("Type")).toHaveAttribute("aria-invalid", "true");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Select label="Field" options={OPTIONS} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
