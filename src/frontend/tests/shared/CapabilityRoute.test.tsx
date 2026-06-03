import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { CapabilityRoute } from "../../src/shared/CapabilityRoute";

let mockAuth: { isLoading: boolean; canViewList: boolean };
vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/radar" element={<div>radar page</div>} />
        <Route
          path="/list"
          element={
            <CapabilityRoute capability="canViewList">
              <div>list page</div>
            </CapabilityRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CapabilityRoute", () => {
  it("redirects to /radar when the capability is absent", () => {
    mockAuth = { isLoading: false, canViewList: false };
    renderAt("/list");
    expect(screen.getByText("radar page")).toBeInTheDocument();
    expect(screen.queryByText("list page")).toBeNull();
  });

  it("renders children when the capability is present", () => {
    mockAuth = { isLoading: false, canViewList: true };
    renderAt("/list");
    expect(screen.getByText("list page")).toBeInTheDocument();
  });

  it("renders nothing while auth/capabilities are loading", () => {
    mockAuth = { isLoading: true, canViewList: false };
    const { container } = renderAt("/list");
    expect(container).toBeEmptyDOMElement();
  });
});
