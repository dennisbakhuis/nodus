import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileCompletionModal } from "../../src/shared/ProfileCompletionModal";

const getMyProfile = vi.fn();
const updateMyProfile = vi.fn();

vi.mock("../../src/api/profile", () => ({
  getMyProfile: (...a: unknown[]) => getMyProfile(...a),
  updateMyProfile: (...a: unknown[]) => updateMyProfile(...a),
}));

const refreshUser = vi.fn();
let mockAuth: {
  isAuthenticated: boolean;
  user: { profile_incomplete?: boolean } | null;
  refreshUser: () => void;
};

vi.mock("../../src/shared/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

function renderModal() {
  return render(
    <MemoryRouter>
      <ProfileCompletionModal />
    </MemoryRouter>,
  );
}

describe("ProfileCompletionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyProfile.mockResolvedValue({
      id: "p1",
      full_name: "Jane Doe",
      company: "",
      email: "",
      department: "",
      role: "",
    });
    updateMyProfile.mockResolvedValue(undefined);
    mockAuth = {
      isAuthenticated: true,
      user: { profile_incomplete: true },
      refreshUser,
    };
  });

  it("renders blocking when the profile is incomplete", async () => {
    renderModal();
    expect(
      await screen.findByText("Complete your profile"),
    ).toBeInTheDocument();
    // Blocking modal hides the close button.
    expect(screen.queryByRole("button", { name: "Close modal" })).toBeNull();
  });

  it("renders nothing when the profile is complete", () => {
    mockAuth = {
      isAuthenticated: true,
      user: { profile_incomplete: false },
      refreshUser,
    };
    renderModal();
    expect(screen.queryByText("Complete your profile")).toBeNull();
  });

  it("submits the profile and refreshes the user", async () => {
    renderModal();
    await screen.findByText("Complete your profile");

    fireEvent.change(screen.getByLabelText(/Company/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "jane@acme.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/i }));

    await waitFor(() => {
      expect(updateMyProfile).toHaveBeenCalledWith(
        expect.objectContaining({ company: "Acme", email: "jane@acme.example" }),
      );
    });
    expect(refreshUser).toHaveBeenCalled();
  });
});
