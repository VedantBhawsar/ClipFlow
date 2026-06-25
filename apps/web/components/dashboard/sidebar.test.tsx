import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/hooks/use-youtube-connection", () => ({
  useYouTubeConnection: vi.fn(),
}));

vi.mock("@/hooks/use-sign-out", () => ({
  useSignOut: vi.fn(),
}));

import { Sidebar } from "./sidebar.js";
import { useSession } from "next-auth/react";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";
import { useSignOut } from "@/hooks/use-sign-out";
import type { YouTubeConnection } from "@clipflow/types";

const mockUseSession = vi.mocked(useSession);
const mockUseYouTubeConnection = vi.mocked(useYouTubeConnection);
const mockUseSignOut = vi.mocked(useSignOut);

const SESSION = {
  data: {
    accessToken: "test-access-token",
    userId: "user-1",
    user: {
      id: "user-1",
      email: "creator@example.com",
      name: "Test Creator",
      onboardingCompleted: true,
      displayName: null,
    },
    expires: "",
  },
  status: "authenticated",
  update: vi.fn(),
} as unknown as ReturnType<typeof useSession>;

const DISCONNECTED: YouTubeConnection = {
  status: "disconnected",
  channelId: null,
  channelTitle: null,
  channelThumbnailUrl: null,
  connectedAt: null,
  lastVerifiedAt: null,
};

const CONNECTED: YouTubeConnection = {
  status: "connected",
  channelId: "UC-channel-1",
  channelTitle: "Pixel Loop",
  channelThumbnailUrl: "https://example.com/thumb.jpg",
  connectedAt: "2026-01-01T00:00:00.000Z",
  lastVerifiedAt: "2026-01-02T00:00:00.000Z",
};

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue(SESSION);
    mockUseYouTubeConnection.mockReturnValue({
      data: DISCONNECTED,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);
    mockUseSignOut.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSignOut>);
  });

  it("renders the Settings nav link enabled", () => {
    render(<Sidebar />);
    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink).not.toHaveAttribute("aria-disabled");
    expect(settingsLink).toHaveAttribute("href", "/dashboard/settings");
  });

  it("links the user email row to /settings/profile", () => {
    render(<Sidebar />);
    const emailLink = screen.getByText("creator@example.com").closest("a");
    expect(emailLink).toHaveAttribute("href", "/dashboard/settings/profile");
  });

  it("links the Published entry to /dashboard/published as an enabled nav item", () => {
    render(<Sidebar />);
    const published = screen.getByText("Published").closest("a");
    expect(published).not.toHaveAttribute("aria-disabled");
    expect(published).toHaveAttribute("href", "/dashboard/published");
  });

  it("still shows Billing as a disabled placeholder", () => {
    render(<Sidebar />);
    const billing = screen.getByText("Billing").closest("span");
    expect(billing).toHaveAttribute("aria-disabled", "true");
  });

  it("shows 'Channel not connected' when connection data is null", () => {
    mockUseYouTubeConnection.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);
    render(<Sidebar />);
    expect(screen.getByText("Channel not connected")).toBeInTheDocument();
  });

  it("shows 'Channel not connected' when status is disconnected", () => {
    mockUseYouTubeConnection.mockReturnValue({
      data: DISCONNECTED,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);
    render(<Sidebar />);
    expect(screen.getByText("Channel not connected")).toBeInTheDocument();
  });

  it("shows the channel title when connected", () => {
    mockUseYouTubeConnection.mockReturnValue({
      data: CONNECTED,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);
    render(<Sidebar />);
    expect(screen.getByText("Pixel Loop")).toBeInTheDocument();
  });

  it("shows 'Reconnect required' when needs_reauth", () => {
    mockUseYouTubeConnection.mockReturnValue({
      data: { ...DISCONNECTED, status: "needs_reauth" },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useYouTubeConnection>);
    render(<Sidebar />);
    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
  });
});
