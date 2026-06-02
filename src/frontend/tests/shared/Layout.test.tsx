import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Layout } from "../../src/shared/Layout";

type MockAuth = { isWriter: boolean; isAuthenticated: boolean };
let mockAuth: MockAuth;

vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => mockAuth,
}));
vi.mock("../../src/shared/RadarCycleContext", () => ({
  useRadarCycle: () => ({ fullBleed: false, setFullBleed: vi.fn() }),
}));
vi.mock("../../src/shared/ExportContext", () => ({
  useExportTarget: () => ({
    target: { mode: "radar", svgRef: { current: null }, data: {} },
  }),
}));
vi.mock("../../src/shared/AddActionContext", () => ({
  useAddAction: () => ({ target: null }),
}));
vi.mock("../../src/shared/DemoModeContext", () => ({
  useDemoMode: () => ({
    target: { running: false, onClick: vi.fn(), dwell: null },
  }),
}));
vi.mock("../../src/radar/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));
vi.mock("../../src/radar/DataExportMenu", () => ({
  DataExportMenu: () => <div data-testid="data-export-menu" />,
}));
vi.mock("../../src/help/HelpButton", () => ({ HelpButton: () => <div /> }));
vi.mock("../../src/help/HelpPanel", () => ({ HelpPanel: () => <div /> }));
vi.mock("../../src/shared/AuthMenu", () => ({ AuthMenu: () => <div /> }));

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout>
        <div>content</div>
      </Layout>
    </MemoryRouter>,
  );
}

describe("Layout header controls", () => {
  beforeEach(() => {
    mockAuth = { isWriter: false, isAuthenticated: false };
  });

  it("hides the demo and export controls from public/anonymous viewers", () => {
    mockAuth = { isWriter: false, isAuthenticated: false };
    renderLayout();
    expect(screen.queryByRole("button", { name: /presentation mode/i })).toBeNull();
    expect(screen.queryByTestId("export-menu")).toBeNull();
  });

  it("shows the demo and export controls to a signed-in user", () => {
    mockAuth = { isWriter: true, isAuthenticated: true };
    renderLayout();
    expect(screen.getByRole("button", { name: /presentation mode/i })).toBeInTheDocument();
    expect(screen.getByTestId("export-menu")).toBeInTheDocument();
  });
});
