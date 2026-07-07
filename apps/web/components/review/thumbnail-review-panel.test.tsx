/**
 * Tests for `<ThumbnailReviewPanel>` — the client-side wrapper around
 * `<ThumbnailReview>` that owns the selection state and wires the
 * Regenerate button to the API.
 *
 * What we cover here:
 *   - The grid renders every option as a button when not disabled,
 *     with `initialSelectedId` carrying the visual "selected" state.
 *   - Clicking a different tile calls `selectThumbnail` on the api.
 *   - The Regenerate button calls `regenerateThumbnails`.
 *   - When `disabled` is true, the Regenerate button is disabled and
 *     filled tiles render as read-only groups rather than buttons.
 *
 * Mocking:
 *   - `next-auth/react.useSession` provides an authenticated session so
 *     `useApi()` returns our stub instead of `null`.
 *   - `@/hooks/use-api` is replaced with a thin stub so the panel
 *     talks to a controllable spy without hitting the network.
 *   - TanStack Query needs a real `QueryClient` for the mutations to
 *     fire; we wrap each render in a fresh one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const selectThumbnailSpy = vi.fn();
const regenerateThumbnailsSpy = vi.fn();

vi.mock("@/hooks/use-api", () => ({
  useApi: () => ({
    selectThumbnail: selectThumbnailSpy,
    regenerateThumbnails: regenerateThumbnailsSpy,
  }),
}));

import { useSession } from "next-auth/react";
import { ThumbnailReviewPanel } from "./thumbnail-review-panel.js";
import type { ThumbnailOption } from "./thumbnail-card.js";

const optionsFixture: ThumbnailOption[] = [
  { id: "t_1", src: "https://x/1.jpg", alt: "", label: "AI candidate 1 of 2" },
  { id: "t_2", src: "https://x/2.jpg", alt: "", label: "AI candidate 2 of 2" },
  { id: "slot-2", src: null, alt: "", label: "Candidate 3" },
  { id: "slot-3", src: null, alt: "", label: "Candidate 4" },
];

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

interface RenderProps {
  initialSelectedId?: string | null;
  disabled?: boolean;
}

function renderPanel(props: RenderProps = {}) {
  return render(
    <ThumbnailReviewPanel
      videoId="v_1"
      options={optionsFixture}
      initialSelectedId={props.initialSelectedId ?? null}
      regenerationsUsed={0}
      regenerationsAllowed={5}
      disabled={props.disabled ?? false}
    />,
    { wrapper: makeWrapper() },
  );
}

describe("ThumbnailReviewPanel", () => {
  beforeEach(() => {
    selectThumbnailSpy.mockReset();
    regenerateThumbnailsSpy.mockReset();
    selectThumbnailSpy.mockResolvedValue({ id: "t_1" });
    regenerateThumbnailsSpy.mockResolvedValue({ generationId: "g_1" });
    vi.mocked(useSession).mockReturnValue({
      data: {
        accessToken: "test-token",
        user: {
          id: "user-1",
          email: "a@b.com",
          name: null,
          onboardingCompleted: true,
          displayName: null,
        },
        expires: "",
      },
      status: "authenticated",
    } as unknown as ReturnType<typeof useSession>);
  });

  it("renders filled options as buttons and carries the initial selection", () => {
    renderPanel({ initialSelectedId: "t_2" });
    expect(
      screen.getByRole("button", { name: /AI candidate 1 of 2/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /AI candidate 2 of 2/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("calls selectThumbnail when a different tile is clicked", async () => {
    const user = userEvent.setup();
    renderPanel({ initialSelectedId: "t_2" });

    await user.click(
      screen.getByRole("button", { name: /AI candidate 1 of 2/i }),
    );
    expect(selectThumbnailSpy).toHaveBeenCalledWith("v_1", "t_1");
  });

  it("calls regenerateThumbnails when the Regenerate button is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: /Regenerate options/i }),
    );
    expect(regenerateThumbnailsSpy).toHaveBeenCalledWith("v_1", undefined);
  });

  it("renders every tile as a read-only group when disabled", () => {
    renderPanel({ disabled: true });
    // No filled tile is a button when the panel is disabled.
    expect(
      screen.queryByRole("button", { name: /AI candidate 1 of 2/i }),
    ).toBeNull();
    // The regenerate button exists but is disabled.
    expect(
      screen.getByRole("button", { name: /Regenerate options/i }),
    ).toBeDisabled();
  });
});
