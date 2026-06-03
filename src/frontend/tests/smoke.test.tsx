import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { App } from "../src/App";

describe("App", () => {
  it("renders the Nodus brand", () => {
    render(
      <MemoryRouter initialEntries={["/radar"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getAllByText("Nodus").length).toBeGreaterThan(0);
  });

  it("renders navigation links available to anonymous users", () => {
    render(
      <MemoryRouter initialEntries={["/radar"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Radar" })).toBeInTheDocument();
    // "List" requires the list_view capability, which excludes public readers
    // by default; "Manage" only appears for writers/admins. The smoke test runs
    // anonymous, so neither should be present.
    expect(screen.queryByRole("link", { name: "List" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
  });
});
