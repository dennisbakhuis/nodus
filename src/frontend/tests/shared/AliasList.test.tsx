import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  AliasList,
  normalizeAliasClient,
} from "../../src/shared/AliasList";

describe("normalizeAliasClient", () => {
  it("lowercases", () => {
    expect(normalizeAliasClient("Grid")).toBe("grid");
  });

  it("replaces punctuation with space", () => {
    expect(normalizeAliasClient("Grid-Forming")).toBe("grid forming");
  });

  it("collapses whitespace", () => {
    expect(normalizeAliasClient("  grid   forming  ")).toBe("grid forming");
  });

  it("treats unicode punctuation as separator", () => {
    expect(normalizeAliasClient("AC—DC")).toBe("ac dc");
  });

  it("returns empty for purely punctuation input", () => {
    expect(normalizeAliasClient("---")).toBe("");
  });
});

describe("AliasList", () => {
  function setup(aliases: string[] = []) {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    render(<AliasList aliases={aliases} onAdd={onAdd} onRemove={onRemove} />);
    return { onAdd, onRemove };
  }

  it("renders existing aliases as chips", () => {
    setup(["Grid-Forming", "GFM"]);
    expect(screen.getByText("Grid-Forming")).toBeInTheDocument();
    expect(screen.getByText("GFM")).toBeInTheDocument();
  });

  it("shows placeholder when no aliases yet", () => {
    setup([]);
    expect(screen.getByText("No aliases yet")).toBeInTheDocument();
  });

  it("calls onAdd with raw value when adding a new unique alias", () => {
    const { onAdd } = setup(["Grid-Forming"]);
    fireEvent.change(screen.getByLabelText("New alias"), {
      target: { value: "Battery Storage" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).toHaveBeenCalledWith("Battery Storage");
  });

  it("rejects duplicates regardless of case", () => {
    const { onAdd } = setup(["Grid-Forming"]);
    fireEvent.change(screen.getByLabelText("New alias"), {
      target: { value: "grid-forming" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/duplicates/i);
  });

  it("rejects duplicates regardless of punctuation", () => {
    const { onAdd } = setup(["Grid-Forming"]);
    fireEvent.change(screen.getByLabelText("New alias"), {
      target: { value: "Grid Forming" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/duplicates/i);
  });

  it("calls onRemove when chip remove clicked", () => {
    const { onRemove } = setup(["Grid-Forming"]);
    fireEvent.click(screen.getByLabelText("Remove"));
    expect(onRemove).toHaveBeenCalledWith("Grid-Forming");
  });

  it("submits on Enter", () => {
    const { onAdd } = setup([]);
    const input = screen.getByLabelText("New alias");
    fireEvent.change(input, { target: { value: "New Alias" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("New Alias");
  });

  it("disables add button when input is empty", () => {
    setup([]);
    const button = screen.getByText("Add") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
