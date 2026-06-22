import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar.js";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/use-auth";

const mockUseAuth = vi.mocked(useAuth);

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
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
    } as ReturnType<typeof useAuth>);
  });

  it("renders the Settings nav link enabled", () => {
    render(<Sidebar />);
    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink).not.toHaveAttribute("aria-disabled");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("links the user email row to /settings/profile", () => {
    render(<Sidebar />);
    const emailLink = screen.getByText("creator@example.com").closest("a");
    expect(emailLink).toHaveAttribute("href", "/settings/profile");
  });

  it("still shows Videos and Billing as disabled placeholders", () => {
    render(<Sidebar />);
    const videos = screen.getByText("Videos").closest("span");
    const billing = screen.getByText("Billing").closest("span");
    expect(videos).toHaveAttribute("aria-disabled", "true");
    expect(billing).toHaveAttribute("aria-disabled", "true");
  });

  it("shows 'Channel not connected' by default", () => {
    render(<Sidebar />);
    expect(screen.getByText("Channel not connected")).toBeInTheDocument();
  });

  it("shows a custom channel label when provided", () => {
    render(<Sidebar channelState="connected" channelLabel="Pixel Loop" />);
    expect(screen.getByText("Pixel Loop")).toBeInTheDocument();
  });
});
