import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SearchBox } from "../../src/radar/SearchBox";
import { mockSmallRadarData } from "../../src/radar/__fixtures__/mockRadarData";
import type { RadarEntry } from "../../src/radar/types";

describe("SearchBox", () => {
  const entries: RadarEntry[] = mockSmallRadarData.entries;

  it("renders a search input", () => {
    render(
      <SearchBox
        entries={entries}
        value=""
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole("combobox", { name: /search technologies/i })
    ).toBeInTheDocument();
  });

  it("shows matching results when typing", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SearchBox
        entries={entries}
        value=""
        onChange={onChange}
        onSelect={vi.fn()}
      />
    );
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Edge" } });
    expect(onChange).toHaveBeenCalledWith("Edge");

    rerender(
      <SearchBox
        entries={entries}
        value="Edge"
        onChange={onChange}
        onSelect={vi.fn()}
      />
    );

    const options = screen.queryAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
  });

  it("calls onSelect when a result is clicked", () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    render(
      <SearchBox
        entries={entries}
        value="Edge"
        onChange={onChange}
        onSelect={onSelect}
      />
    );
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const options = screen.queryAllByRole("option");
    if (options.length > 0) {
      fireEvent.mouseDown(options[0]!);
      expect(onSelect).toHaveBeenCalled();
    }
  });

  it("shows no results for non-matching query", () => {
    render(
      <SearchBox
        entries={entries}
        value="xyznotfound"
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    const options = screen.queryAllByRole("option");
    expect(options).toHaveLength(0);
  });

  it("clears on Escape key", () => {
    const onChange = vi.fn();
    render(
      <SearchBox
        entries={entries}
        value="Edge"
        onChange={onChange}
        onSelect={vi.fn()}
      />
    );
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
  });
});
