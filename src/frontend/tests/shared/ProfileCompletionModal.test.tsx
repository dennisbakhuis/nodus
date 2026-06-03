import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileCompletionModal } from "../../src/shared/ProfileCompletionModal";

const getMyProfile = vi.fn();
const updateMyProfile = vi.fn();
const getProfileCandidates = vi.fn();
const linkMyProfile = vi.fn();

vi.mock("../../src/api/profile", () => ({
  getMyProfile: (...a: unknown[]) => getMyProfile(...a),
  updateMyProfile: (...a: unknown[]) => updateMyProfile(...a),
  getProfileCandidates: (...a: unknown[]) => getProfileCandidates(...a),
  linkMyProfile: (...a: unknown[]) => linkMyProfile(...a),
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
    getProfileCandidates.mockResolvedValue([]);
    linkMyProfile.mockResolvedValue(undefined);
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

  it("offers matching records and links the chosen one", async () => {
    getProfileCandidates.mockResolvedValue([
      { id: "p-match", full_name: "Jane Doe", company: "Acme", email: "j@a.co" },
    ]);
    renderModal();

    expect(await screen.findByText("Is one of these you?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "This is me" }));

    await waitFor(() => {
      expect(linkMyProfile).toHaveBeenCalledWith("p-match");
    });
    expect(refreshUser).toHaveBeenCalled();
  });

  it("falls back to the fill form via 'create a new profile'", async () => {
    getProfileCandidates.mockResolvedValue([
      { id: "p-match", full_name: "Jane Doe", company: "Acme", email: null },
    ]);
    renderModal();
    await screen.findByText("Is one of these you?");

    fireEvent.click(
      screen.getByRole("button", { name: /create a new profile/i }),
    );
    expect(screen.getByLabelText(/Company/i)).toBeInTheDocument();
  });
});
