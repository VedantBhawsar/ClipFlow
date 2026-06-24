import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileWizard } from "./profile-wizard.js";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-update-profile", () => ({
  useUpdateProfile: vi.fn(),
}));

const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  })),
}));

import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@/hooks/use-update-profile";

const mockUseAuth = vi.mocked(useAuth);
const mockUseUpdateProfile = vi.mocked(useUpdateProfile);

describe("ProfileWizard", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync = vi.fn().mockResolvedValue({});
    mockUseUpdateProfile.mockReturnValue({
      submit: {
        mutateAsync: mockMutateAsync,
        mutate: mockMutateAsync,
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      },
      patch: {
        mutateAsync: vi.fn(),
        mutate: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      },
    } as unknown as ReturnType<typeof useUpdateProfile>);
    mockUseAuth.mockReturnValue({
      refresh: vi.fn(),
      setOnboardingCompleted: vi.fn(),
      setPreferences: vi.fn(),
      patchPreferences: vi.fn(),
      status: "authenticated",
      user: { id: "1", email: "a@b.com", name: "A", authProvider: "EMAIL", emailVerifiedAt: null, createdAt: "" },
      profile: null,
      preferences: null,
      youtubeConnection: null,
      onboardingCompleted: false,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it("renders step 1 with channel name question", () => {
    render(<ProfileWizard />);
    expect(screen.getByText("What should we call your channel?")).toBeInTheDocument();
    expect(screen.getByText("Optional — we use this to personalize your dashboard.")).toBeInTheDocument();
  });

  it("shows Back button disabled on step 1", () => {
    render(<ProfileWizard />);
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
  });

  it("can skip step 1 without entering a name", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("What's your content niche?")).toBeInTheDocument();
  });

  it("advances to step 2 when Next is clicked", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("What's your content niche?")).toBeInTheDocument();
  });

  it("cannot advance from step 2 without selecting a niche", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("advances to step 3 when niche is selected", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("How often do you upload?")).toBeInTheDocument();
  });

  it("cannot advance from step 3 without selecting frequency", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("advances to step 4 when frequency is selected", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("What's your main goal right now?")).toBeInTheDocument();
  });

  it("cannot advance from step 4 without selecting a goal", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: /finish setup/i })).toBeDisabled();
  });

  it("shows Finish setup button on step 4", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));

    expect(screen.getByRole("button", { name: /finish setup/i })).toBeEnabled();
  });

  it("submits profile and navigates to dashboard on finish", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      niche: "GAMING",
      uploadFrequency: "ONE_TO_FOUR",
      primaryGoal: "SAVE_TIME_EDITING",
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard");
  });

  it("omits displayName from payload when empty", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({ displayName: expect.any(String) }),
    );
  });

  it("includes displayName in payload when provided", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.type(screen.getByRole("textbox"), "My Awesome Channel");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "My Awesome Channel" }),
    );
  });

  it("displays error message when submission fails", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new Error("Network error"));
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network error",
    );
  });

  it("allows going back from step 2", async () => {
    const user = userEvent.setup();
    render(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText("What should we call your channel?")).toBeInTheDocument();
  });
});
