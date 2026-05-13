import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Chip } from "../../src/shared/Chip";

describe("Chip", () => {
  it("renders children", () => {
    render(<Chip>Filter A</Chip>);
    expect(screen.getByText("Filter A")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Clickable</Chip>);
    await user.click(screen.getByRole("button", { name: "Clickable" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows remove button when onRemove is provided", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove}>Removable</Chip>);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("does not show remove button without onRemove", () => {
    render(<Chip>No remove</Chip>);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});
