import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsNav } from "./settings-nav.js";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/settings/profile"),
}));

import { usePathname } from "next/navigation";
const mockUsePathname = vi.mocked(usePathname);

describe("SettingsNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/settings/profile");
  });

  it("renders all 7 settings sections", () => {
    render(<SettingsNav />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Scheduling")).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();
    expect(screen.getByText("YouTube connection")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("marks the active section with aria-current=page", () => {
    render(<SettingsNav />);
    const profile = screen.getByText("Profile").closest("a");
    expect(profile).toHaveAttribute("aria-current", "page");
  });

  it("does not mark inactive sections as current", () => {
    render(<SettingsNav />);
    const security = screen.getByText("Security").closest("a");
    expect(security).not.toHaveAttribute("aria-current");
  });

  it("updates active state when pathname changes", () => {
    mockUsePathname.mockReturnValue("/settings/security");
    render(<SettingsNav />);
    const security = screen.getByText("Security").closest("a");
    expect(security).toHaveAttribute("aria-current", "page");
  });
});
