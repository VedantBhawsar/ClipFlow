/**
 * Tests for `<PublishButton>` + the `<PublishSheet>` it opens.
 *
 * The button is a thin client island: it owns the Sheet's open state
 * and renders the trigger. The heavy lifting (validation, mutation,
 * navigation, toast) lives in `<PublishSheet>`. Tests here exercise
 * the end-to-end flow as a single component pair — the button is
 * useless without the Sheet and the Sheet is unreachable without
 * the button, so a unified test file is the right scope.
 *
 * We use real timers throughout. The Sheet's `setTimeout(..., 200)`
 * redirect is awaited via a real `setTimeout` so the test still
 * completes fast (<50ms per test). Fake timers were tried first but
 * collide with radix's portal + focus-management timers, which hang
 * `userEvent` interactions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SettingsResponse } from "@clipflow/types";

import { PublishButton } from "./publish-button.js";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
}));

const mockUsePublishVideo = vi.fn();
vi.mock("@/hooks/use-videos", () => ({
  usePublishVideo: () => mockUsePublishVideo(),
}));

const mockUseSettings = vi.fn();
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => mockUseSettings(),
}));

import { toast } from "sonner";

const baseVideo = {
  id: "vid_1",
  title: "My test video",
  privacyStatus: "private",
};

const settingsWithTimezone: SettingsResponse = {
  profile: null,
  preferences: {
    id: "pref-1",
    notifyProcessingComplete: true,
    notifyPublished: true,
    notifyPublishFailed: true,
    notifyNeedsReauth: true,
    notifyWeeklySummary: false,
    defaultTimezone: "Asia/Kolkata",
    defaultPublishTime: "18:00",
    chapterBehavior: "ALWAYS_REVIEW",
    thumbnailStyle: "AUTO",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  youtubeConnection: {
    status: "connected",
    channelId: null,
    channelTitle: null,
    channelThumbnailUrl: null,
    connectedAt: null,
    lastVerifiedAt: null,
  },
  channelThumbnailStyle: null,
};

/**
 * Format a Date as `YYYY-MM-DDTHH:mm` in the local timezone — the
 * format `<input type="datetime-local">` accepts and the only way to
 * round-trip a future ms-since-epoch back into the same ms-since-epoch
 * after `new Date(...)` parsing (which interprets no-tz strings as
 * local). `.toISOString().slice(0, 16)` does NOT work when the runner
 * is in a non-UTC TZ.
 */
const formatLocalDatetime = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

describe("PublishButton + PublishSheet", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync = vi.fn().mockResolvedValue({
      ...baseVideo,
      status: "PUBLISHING",
    });
    mockUsePublishVideo.mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof import("@/hooks/use-videos").usePublishVideo>);
    mockUseSettings.mockReturnValue({
      data: settingsWithTimezone,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the Publish trigger button", () => {
    render(<PublishButton video={baseVideo} />);
    expect(screen.getByTestId("publish-button")).toBeInTheDocument();
    expect(screen.getByTestId("publish-button")).toHaveTextContent("Publish");
  });

  it("opens the sheet with the video title and current privacy", async () => {
    const user = userEvent.setup();
    render(<PublishButton video={baseVideo} />);

    await user.click(screen.getByTestId("publish-button"));

    expect(screen.getByTestId("publish-sheet-title")).toHaveTextContent(
      "My test video",
    );
    expect(screen.getByTestId("publish-sheet-privacy")).toHaveTextContent(
      "Private — only you",
    );
    // The timezone label comes from the user's settings preference.
    expect(screen.getByTestId("publish-sheet-timezone")).toHaveTextContent(
      "(Asia/Kolkata)",
    );
  });

  it("calls publishVideo with no schedule and redirects on empty datetime submit", async () => {
    const user = userEvent.setup();
    render(<PublishButton video={baseVideo} />);

    await user.click(screen.getByTestId("publish-button"));
    await user.click(screen.getByTestId("publish-sheet-submit"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: baseVideo.id,
        body: {},
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Video published.");

    // Redirect is deferred 200 ms to let the sheet's close animation
    // finish — wait the real duration.
    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard/published");
      },
      { timeout: 1000 },
    );
  });

  it("calls publishVideo with an ISO string and redirects on valid datetime submit", async () => {
    const user = userEvent.setup();
    render(<PublishButton video={baseVideo} />);

    // Pick a datetime 2 hours from now — passes the 15-min floor and
    // the 60-day ceiling. We build the `YYYY-MM-DDTHH:mm` string from
    // local-time fields (NOT `.toISOString().slice(0,16)`, which would
    // drop the TZ marker and confuse the parser when the test runner
    // runs in a non-UTC TZ).
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const futureLocal = formatLocalDatetime(future);

    await user.click(screen.getByTestId("publish-button"));
    const datetime = screen.getByTestId("publish-sheet-datetime");
    // Set the datetime atomically — char-by-char typing would trigger
    // validation against partial strings (e.g. "2026-07-02T20:5" parses
    // as a different time than the final value).
    fireEvent.change(datetime, { target: { value: futureLocal } });
    await user.click(screen.getByTestId("publish-sheet-submit"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mockMutateAsync.mock.calls[0]?.[0];
    expect(call.id).toBe(baseVideo.id);
    expect(typeof call.body?.scheduledPublishAt).toBe("string");
    // The ISO string should be a valid date in the future.
    const submitted = new Date(call.body.scheduledPublishAt);
    expect(submitted.getTime()).toBeGreaterThan(Date.now());
    expect(submitted.getTime()).toBeLessThan(Date.now() + 3 * 60 * 60 * 1000);

    expect(toast.success).toHaveBeenCalledWith("Video published.");
    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard/published");
      },
      { timeout: 1000 },
    );
  });

  it("shows an inline error and disables submit for a past datetime", async () => {
    const user = userEvent.setup();
    render(<PublishButton video={baseVideo} />);

    await user.click(screen.getByTestId("publish-button"));

    // jsdom's datetime-local input accepts the value as-is (it doesn't
    // enforce min/max). Use fireEvent to set the value atomically —
    // char-by-char typing would trigger validation against partial
    // strings. Build local-time string explicitly (see helper above).
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const pastLocal = formatLocalDatetime(past);
    fireEvent.change(screen.getByTestId("publish-sheet-datetime"), {
      target: { value: pastLocal },
    });

    const error = screen.getByTestId("publish-sheet-error");
    expect(error).toHaveTextContent(/must be in the future/i);

    const submit = screen.getByTestId("publish-sheet-submit");
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("shows the YouTube-min error for a datetime < 15 min from now", async () => {
    const user = userEvent.setup();
    render(<PublishButton video={baseVideo} />);

    await user.click(screen.getByTestId("publish-button"));

    const soon = new Date(Date.now() + 5 * 60 * 1000); // 5 min from now
    const soonLocal = formatLocalDatetime(soon);
    fireEvent.change(screen.getByTestId("publish-sheet-datetime"), {
      target: { value: soonLocal },
    });

    expect(screen.getByTestId("publish-sheet-error")).toHaveTextContent(
      /at least 15 min/i,
    );
    expect(screen.getByTestId("publish-sheet-submit")).toBeDisabled();
  });

  it("shows the 60-day-max error for a datetime > 60 days from now", async () => {
    const user = userEvent.setup();
    render(<PublishButton video={baseVideo} />);

    await user.click(screen.getByTestId("publish-button"));

    const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const farLocal = formatLocalDatetime(farFuture);
    fireEvent.change(screen.getByTestId("publish-sheet-datetime"), {
      target: { value: farLocal },
    });

    expect(screen.getByTestId("publish-sheet-error")).toHaveTextContent(
      /within 60 days/i,
    );
    expect(screen.getByTestId("publish-sheet-submit")).toBeDisabled();
  });

  it("surfaces the API error via toast and does not redirect on failure", async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error("Daily quota exhausted."));

    const user = userEvent.setup();
    render(<PublishButton video={baseVideo} />);
    await user.click(screen.getByTestId("publish-button"));
    await user.click(screen.getByTestId("publish-sheet-submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Daily quota exhausted.");
    });

    // No redirect on failure — wait a real 250ms then assert the
    // push was never called.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not render the timezone label when the user has no preference set", async () => {
    mockUseSettings.mockReturnValue({
      data: {
        ...settingsWithTimezone,
        preferences: { ...settingsWithTimezone.preferences!, defaultTimezone: "" },
      },
      isLoading: false,
    });
    const user = userEvent.setup();

    render(<PublishButton video={baseVideo} />);
    await user.click(screen.getByTestId("publish-button"));

    expect(screen.queryByTestId("publish-sheet-timezone")).not.toBeInTheDocument();
  });
});