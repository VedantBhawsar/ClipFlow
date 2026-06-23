import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsForm } from "./notifications-form.js";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-update-preferences", () => ({
  useUpdatePreferences: vi.fn(),
}));

import { useAuth } from "@/hooks/use-auth";
import { useUpdatePreferences } from "@/hooks/use-update-preferences";

const mockUseAuth = vi.mocked(useAuth);
const mockUseUpdatePreferences = vi.mocked(useUpdatePreferences);

const basePrefs = {
  id: "pref-1",
  notifyProcessingComplete: true,
  notifyPublished: true,
  notifyPublishFailed: true,
  notifyNeedsReauth: true,
  notifyWeeklySummary: false,
  defaultTimezone: "UTC",
  defaultPublishTime: "18:00",
  chapterBehavior: "ALWAYS_REVIEW" as const,
  thumbnailStyle: "AUTO" as const,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("NotificationsForm", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync = vi.fn().mockImplementation(async (body: object) => ({
      ...basePrefs,
      ...body,
    }));
    mockUseUpdatePreferences.mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useUpdatePreferences>);
    mockUseAuth.mockReturnValue({
      preferences: basePrefs,
      patchPreferences: vi.fn(),
      refresh: vi.fn(),
      status: "authenticated",
      user: null,
      profile: null,
      youtubeConnection: null,
      onboardingCompleted: true,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      setOnboardingCompleted: vi.fn(),
      setPreferences: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
  });

  it("renders all five toggles", () => {
    render(<NotificationsForm />);
    expect(
      screen.getByText("When a video finishes processing"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("When a video goes live on YouTube"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("When a scheduled publish fails"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("When YouTube needs to be reconnected"),
    ).toBeInTheDocument();
    expect(screen.getByText("Weekly summary")).toBeInTheDocument();
  });

  it("calls the mutation with the right boolean on save", async () => {
    const user = userEvent.setup();
    render(<NotificationsForm />);
    // Flip the "weekly summary" toggle (currently off → on)
    const weeklySummaryRow = screen
      .getByText("Weekly summary")
      .closest("li")!;
    const switchBtn = weeklySummaryRow.querySelector(
      'button[role="switch"]',
    ) as HTMLElement;
    await user.click(switchBtn);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ notifyWeeklySummary: true }),
    );
  });

  it("disables the Save button until a toggle is flipped", () => {
    render(<NotificationsForm />);
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
  });
});
