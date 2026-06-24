import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar.js";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth, type UseAuthValue } from "@/hooks/use-auth";
import type { YouTubeConnection } from "@clipflow/types";

const mockUseAuth = vi.mocked(useAuth);

const AUTH_BASE: UseAuthValue = {
  status: "authenticated",
  user: {
    id: "user-1",
    email: "creator@example.com",
    name: "Test Creator",
    authProvider: "EMAIL",
    emailVerifiedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  profile: null,
  preferences: null,
  youtubeConnection: null,
  onboardingCompleted: true,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn(),
  setOnboardingCompleted: vi.fn(),
  setPreferences: vi.fn(),
  patchPreferences: vi.fn(),
};

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
    mockUseAuth.mockReturnValue(AUTH_BASE);
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

  it("shows 'Channel not connected' when youtubeConnection is null", () => {
    mockUseAuth.mockReturnValue({
      ...AUTH_BASE,
      youtubeConnection: null,
    });
    render(<Sidebar />);
    expect(screen.getByText("Channel not connected")).toBeInTheDocument();
  });

  it("shows 'Channel not connected' when status is disconnected", () => {
    mockUseAuth.mockReturnValue({
      ...AUTH_BASE,
      youtubeConnection: DISCONNECTED,
    });
    render(<Sidebar />);
    expect(screen.getByText("Channel not connected")).toBeInTheDocument();
  });

  it("shows the channel title when connected", () => {
    mockUseAuth.mockReturnValue({
      ...AUTH_BASE,
      youtubeConnection: CONNECTED,
    });
    render(<Sidebar />);
    expect(screen.getByText("Pixel Loop")).toBeInTheDocument();
  });

  it("shows 'Reconnect required' when needs_reauth", () => {
    mockUseAuth.mockReturnValue({
      ...AUTH_BASE,
      youtubeConnection: {
        ...DISCONNECTED,
        status: "needs_reauth",
      },
    });
    render(<Sidebar />);
    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
  });
});
