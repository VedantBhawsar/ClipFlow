import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfileWizard } from "./profile-wizard.js";

vi.mock("@/hooks/use-update-profile", () => ({
  useUpdateProfile: vi.fn(),
}));

vi.mock("@/hooks/use-youtube-connection", () => ({
  useYouTubeConnection: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  })),
}));

import { useUpdateProfile } from "@/hooks/use-update-profile";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";
import { useSession } from "next-auth/react";

const mockUseUpdateProfile = vi.mocked(useUpdateProfile);
const mockUseYouTubeConnection = vi.mocked(useYouTubeConnection);
const mockUseSession = vi.mocked(useSession);

/**
 * Wrapper that exposes a fresh QueryClient per render. Step 5 mounts
 * `<QuestionThumbnailStyle>`, which calls `useQuery`/`useMutation`
 * for channel thumbnails — without a provider those hooks throw.
 */
const renderWithQueryClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
};

describe("ProfileWizard", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;

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

    mockUpdate = vi.fn().mockResolvedValue(undefined);
    mockUseSession.mockReturnValue({
      status: "authenticated",
      data: {
        user: { id: "1", email: "a@b.com", name: "A" } as never,
        expires: "",
      } as never,
      update: mockUpdate,
    } as unknown as ReturnType<typeof useSession>);

    // Default: no YouTube connection, hook finished loading. Individual
    // tests override `mockUseYouTubeConnection.mockReturnValue(...)` to
    // exercise step 5's "connected" vs "disconnected" branches.
    mockUseYouTubeConnection.mockReturnValue({
      data: { status: "disconnected" },
      isLoading: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);
  });

  it("renders step 1 with channel name question", () => {
    renderWithQueryClient(<ProfileWizard />);
    expect(screen.getByText("What should we call your channel?")).toBeInTheDocument();
    expect(screen.getByText("Optional — we use this to personalize your dashboard.")).toBeInTheDocument();
  });

  it("shows Back button disabled on step 1", () => {
    renderWithQueryClient(<ProfileWizard />);
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
  });

  it("can skip step 1 without entering a name", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("What's your content niche?")).toBeInTheDocument();
  });

  it("advances to step 2 when Next is clicked", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("What's your content niche?")).toBeInTheDocument();
  });

  it("cannot advance from step 2 without selecting a niche", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("advances to step 3 when niche is selected", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("How often do you upload?")).toBeInTheDocument();
  });

  it("cannot advance from step 3 without selecting frequency", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("advances to step 4 when frequency is selected", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("What's your main goal right now?")).toBeInTheDocument();
  });

  it("cannot advance from step 4 without selecting a goal", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // On step 4, the bottom button still says "Next" — selecting a
    // goal is required to advance to step 5.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows step 5 with YouTube prompt when YouTube is not connected", async () => {
    mockUseYouTubeConnection.mockReturnValue({
      data: { status: "disconnected" },
      isLoading: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);

    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 5 shows the personalized thumbnail prompt + a skip CTA.
    expect(screen.getByText("Personalize your thumbnails")).toBeInTheDocument();
    expect(
      screen.getByText(/connect your youtube channel/i),
    ).toBeInTheDocument();
    // The bottom Finish button is disabled because the inner component
    // owns step 5's completion in the connected branch.
    expect(screen.getByRole("button", { name: /finish setup/i })).toBeDisabled();
  });

  it("submits and navigates when user skips step 5 via the inline skip button", async () => {
    mockUseYouTubeConnection.mockReturnValue({
      data: { status: "disconnected" },
      isLoading: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);

    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Inline "Skip — go to dashboard" CTA inside the step 5 panel.
    await user.click(screen.getByRole("button", { name: /skip — go to dashboard/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      niche: "GAMING",
      uploadFrequency: "ONE_TO_FOUR",
      primaryGoal: "SAVE_TIME_EDITING",
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard");
  });

  it("renders QuestionThumbnailStyle on step 5 when YouTube is connected", async () => {
    mockUseYouTubeConnection.mockReturnValue({
      data: {
        status: "connected",
        channelId: "UC_x",
        channelTitle: "My Channel",
        channelThumbnailUrl: null,
        connectedAt: null,
        lastVerifiedAt: null,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);

    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // When YouTube is connected, the inner QuestionThumbnailStyle
    // component takes over — the "Fetch my YouTube thumbnails" CTA
    // inside the idle card surfaces immediately.
    expect(
      screen.getByRole("button", { name: /fetch my youtube thumbnails/i }),
    ).toBeInTheDocument();
    // The bottom Finish button is hidden behind sr-only so the inner
    // component's onComplete callback owns the submission. We assert
    // via the container's text since sr-only + aria-hidden removes
    // the button from the accessible tree.
    expect(screen.getByText(/finish setup/i)).toHaveClass("sr-only");
  });

  it("submits profile, updates session, and navigates to dashboard on finish", async () => {
    // YouTube disconnected → step 5 shows the inline skip CTA, which
    // is the only way to finish (the bottom button is disabled).
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /skip — go to dashboard/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      niche: "GAMING",
      uploadFrequency: "ONE_TO_FOUR",
      primaryGoal: "SAVE_TIME_EDITING",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      onboardingCompleted: true,
      displayName: null,
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard");
  });

  it("omits displayName from payload when empty", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /skip — go to dashboard/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({ displayName: expect.any(String) }),
    );
  });

  it("includes displayName in payload when provided", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.type(screen.getByRole("textbox"), "My Awesome Channel");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /skip — go to dashboard/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "My Awesome Channel" }),
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      onboardingCompleted: true,
      displayName: "My Awesome Channel",
    });
  });

  it("displays error message when submission fails", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new Error("Network error"));
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /1–4 per month/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /save time editing/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /skip — go to dashboard/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network error",
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows going back from step 2", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileWizard />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /gaming/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText("What should we call your channel?")).toBeInTheDocument();
  });
});
