import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    replace: mockReplace,
    push: mockPush,
    refresh: mockRefresh,
  })),
  usePathname: vi.fn(() => "/dashboard"),
}));

import { AuthGuard } from "./auth-guard.js";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

const mockUseSession = vi.mocked(useSession);

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

const renderGuard = (status: SessionStatus) => {
  mockUseSession.mockReturnValue({
    status,
    data: null,
    update: vi.fn(),
  } as unknown as ReturnType<typeof useSession>);

  return render(<AuthGuard>Protected Content</AuthGuard>);
};

describe("AuthGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  it("shows loading state while auth is hydrating", () => {
    renderGuard("loading");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    renderGuard("authenticated");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("returns null when unauthenticated (redirect handled by useEffect)", () => {
    const { container } = renderGuard("unauthenticated");
    expect(container).toBeEmptyDOMElement();
  });

  it("does not redirect when already on /signin", () => {
    vi.mocked(usePathname).mockReturnValue("/signin");
    const { container } = renderGuard("unauthenticated");
    expect(container).toBeEmptyDOMElement();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not redirect when already on /signup", () => {
    vi.mocked(usePathname).mockReturnValue("/signup");
    const { container } = renderGuard("unauthenticated");
    expect(container).toBeEmptyDOMElement();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated user to /signin with callbackUrl", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    renderGuard("unauthenticated");
    expect(mockReplace).toHaveBeenCalledWith("/signin?callbackUrl=%2Fdashboard");
  });
});