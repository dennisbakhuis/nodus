import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Table } from "../../src/shared/Table";

type Row = { id: string; name: string; ring: string };

const COLUMNS = [
  { key: "name", header: "Name", sortable: true, render: (r: Row) => r.name },
  { key: "ring", header: "Ring", render: (r: Row) => r.ring },
];

const ROWS: Row[] = [
  { id: "1", name: "Alpha", ring: "Invest" },
  { id: "2", name: "Beta", ring: "Pilot" },
];

describe("Table", () => {
  it("renders headers and rows", () => {
    render(<Table columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Ring")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders empty message when no rows", () => {
    render(
      <Table columns={COLUMNS} rows={[]} getRowKey={(r) => r.id} emptyMessage="Nothing here" />
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("calls onRowClick when row is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<Table columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} onRowClick={onRowClick} />);
    await user.click(screen.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it("sortable column header has aria-sort attribute", () => {
    render(<Table columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} />);
    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    expect(nameHeader).toHaveAttribute("aria-sort", "none");
  });

  it("clicking sortable header changes aria-sort", async () => {
    const user = userEvent.setup();
    render(<Table columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} />);
    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader);
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    await user.click(nameHeader);
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });
});
