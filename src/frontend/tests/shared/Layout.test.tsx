import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Layout } from "../../src/shared/Layout";

type MockAuth = {
  isWriter: boolean;
  isAuthenticated: boolean;
  canViewList: boolean;
};
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
    mockAuth = { isWriter: false, isAuthenticated: false, canViewList: true };
  });

  it("hides the demo and export controls from public/anonymous viewers", () => {
    mockAuth = { isWriter: false, isAuthenticated: false, canViewList: true };
    renderLayout();
    expect(screen.queryByRole("button", { name: /presentation mode/i })).toBeNull();
    expect(screen.queryByTestId("export-menu")).toBeNull();
  });

  it("shows the demo and export controls to a signed-in user", () => {
    mockAuth = { isWriter: true, isAuthenticated: true, canViewList: true };
    renderLayout();
    expect(screen.getByRole("button", { name: /presentation mode/i })).toBeInTheDocument();
    expect(screen.getByTestId("export-menu")).toBeInTheDocument();
  });
});

describe("Layout navigation", () => {
  it("hides the List tab when the role lacks the list_view capability", () => {
    mockAuth = { isWriter: false, isAuthenticated: false, canViewList: false };
    renderLayout();
    expect(screen.getByRole("link", { name: "Radar" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "List" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
  });

  it("shows the List tab when the role has the list_view capability", () => {
    mockAuth = { isWriter: false, isAuthenticated: false, canViewList: true };
    renderLayout();
    expect(screen.getByRole("link", { name: "List" })).toBeInTheDocument();
  });

  it("shows the Manage tab to writers", () => {
    mockAuth = { isWriter: true, isAuthenticated: true, canViewList: true };
    renderLayout();
    expect(screen.getByRole("link", { name: "Manage" })).toBeInTheDocument();
  });
});
