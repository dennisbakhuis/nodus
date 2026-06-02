import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProtectedRoute } from "../../src/shared/ProtectedRoute";

type MockAuth = {
  isLoading: boolean;
  isWriter: boolean;
  isAdmin: boolean;
};

let mockAuth: MockAuth;

vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

function renderGuard(requireRole: "writer" | "admin") {
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route
          path="/secret"
          element={
            <ProtectedRoute requireRole={requireRole} redirectTo="/radar">
              <div>SECRET</div>
            </ProtectedRoute>
          }
        />
        <Route path="/radar" element={<div>RADAR HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockAuth = { isLoading: false, isWriter: false, isAdmin: false };
  });

  it("renders nothing while the auth check is loading (no redirect flash)", () => {
    mockAuth = { isLoading: true, isWriter: false, isAdmin: false };
    renderGuard("writer");
    expect(screen.queryByText("SECRET")).toBeNull();
    expect(screen.queryByText("RADAR HOME")).toBeNull();
  });

  it("redirects an anonymous/public visitor away from a writer route", () => {
    mockAuth = { isLoading: false, isWriter: false, isAdmin: false };
    renderGuard("writer");
    expect(screen.queryByText("SECRET")).toBeNull();
    expect(screen.getByText("RADAR HOME")).toBeInTheDocument();
  });

  it("lets a writer into a writer route", () => {
    mockAuth = { isLoading: false, isWriter: true, isAdmin: false };
    renderGuard("writer");
    expect(screen.getByText("SECRET")).toBeInTheDocument();
  });

  it("redirects a writer away from an admin route", () => {
    mockAuth = { isLoading: false, isWriter: true, isAdmin: false };
    renderGuard("admin");
    expect(screen.queryByText("SECRET")).toBeNull();
    expect(screen.getByText("RADAR HOME")).toBeInTheDocument();
  });

  it("lets an admin into both writer and admin routes", () => {
    mockAuth = { isLoading: false, isWriter: true, isAdmin: true };
    renderGuard("admin");
    expect(screen.getByText("SECRET")).toBeInTheDocument();
  });
});
