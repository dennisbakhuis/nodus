import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { ListView } from "../../src/radar/ListView";
import { mockSmallRadarData } from "../../src/radar/__fixtures__/mockRadarData";
import type { FilterState } from "../../src/radar/types";

const baseFilters: FilterState = {
  segments: [],
  rings: [],
  movements: [],
  search: "",
  strategicRelevance: [],
  minTrl: null,
  registryStatuses: ["On Radar", "Backlog", "Archive"],
  hasFactsheet: null,
  hasPeerRefs: null,
  timeToMainstream: [],
  personIds: [],
  candidatesOnly: false,
  visibility: "all",
};

function Harness() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  return (
    <>
      <div data-testid="count">{selectedIds.size}</div>
      <ListView
        data={mockSmallRadarData}
        filters={baseFilters}
        onRowClick={vi.fn()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
    </>
  );
}

function rowCheckboxes(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox").filter((el) => {
    const label = el.getAttribute("aria-label") ?? "";
    return /^Select /.test(label) && !/visible rows$/.test(label);
  }) as HTMLInputElement[];
}

function selectAllCheckbox(): HTMLInputElement {
  return screen.getByLabelText(
    /select all visible rows|deselect all visible rows/i,
  ) as HTMLInputElement;
}

describe("ListView row selection", () => {
  it("hides the checkbox column when selection props are absent", () => {
    render(
      <ListView
        data={mockSmallRadarData}
        filters={baseFilters}
        onRowClick={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText(/select all visible rows/i),
    ).not.toBeInTheDocument();
  });

  it("renders a checkbox per visible row plus a header checkbox", () => {
    render(<Harness />);
    const rows = rowCheckboxes();
    expect(rows.length).toBe(mockSmallRadarData.entries.length);
    expect(selectAllCheckbox()).toBeInTheDocument();
  });

  it("toggling a row checkbox updates the lifted selection", () => {
    render(<Harness />);
    const first = rowCheckboxes()[0]!;
    fireEvent.click(first);
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(first.checked).toBe(true);
    fireEvent.click(first);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("does not trigger row click when checkbox is clicked", () => {
    const onRowClick = vi.fn();
    function NoopHarness() {
      const [ids, setIds] = useState<Set<string>>(new Set());
      return (
        <ListView
          data={mockSmallRadarData}
          filters={baseFilters}
          onRowClick={onRowClick}
          selectedIds={ids}
          onSelectionChange={setIds}
        />
      );
    }
    render(<NoopHarness />);
    fireEvent.click(rowCheckboxes()[0]!);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("header checkbox selects all visible rows; clicking again deselects them", () => {
    render(<Harness />);
    fireEvent.click(selectAllCheckbox());
    expect(screen.getByTestId("count").textContent).toBe(
      String(mockSmallRadarData.entries.length),
    );
    fireEvent.click(selectAllCheckbox());
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("header checkbox is indeterminate when only some rows are selected", () => {
    render(<Harness />);
    fireEvent.click(rowCheckboxes()[0]!);
    expect(selectAllCheckbox().indeterminate).toBe(true);
    expect(selectAllCheckbox().checked).toBe(false);
  });

  it("shift-click extends selection from the previous click", () => {
    render(<Harness />);
    const boxes = rowCheckboxes();
    fireEvent.click(boxes[1]!);
    fireEvent.click(boxes[4]!, { shiftKey: true });
    expect(screen.getByTestId("count").textContent).toBe("4");
    expect(boxes[1]!.checked).toBe(true);
    expect(boxes[2]!.checked).toBe(true);
    expect(boxes[3]!.checked).toBe(true);
    expect(boxes[4]!.checked).toBe(true);
    expect(boxes[0]!.checked).toBe(false);
  });

  it("Clear button empties the whole selection", () => {
    render(<Harness />);
    fireEvent.click(selectAllCheckbox());
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});
