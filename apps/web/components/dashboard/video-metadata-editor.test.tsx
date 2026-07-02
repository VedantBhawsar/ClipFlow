/**
 * Tests for `<VideoMetadataEditor>` — the in-place title/description/tags
 * editor on the review screen. Each section has its own dirty state and
 * Save button; mutations call the same `PATCH /api/videos/:id` endpoint
 * with the partial payload the section owns.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VideoMetadataEditor } from "./video-metadata-editor.js";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock("@/hooks/use-videos", () => ({
  useUpdateVideo: vi.fn(),
}));

import { useUpdateVideo } from "@/hooks/use-videos";

const mockUseUpdateVideo = vi.mocked(useUpdateVideo);

const baseVideo = {
  id: "vid_1",
  title: "Original title",
  description: "Original description",
  tags: ["alpha", "beta"] as string[],
};

describe("VideoMetadataEditor", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync = vi.fn().mockImplementation(
      async ({ body }: { id: string; body: { title?: string; description?: string | null; tags?: string[] } }) => ({
        ...baseVideo,
        ...body,
      }),
    );
    mockUseUpdateVideo.mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useUpdateVideo>);
  });

  it("renders title, description, and tags inputs from props", () => {
    render(<VideoMetadataEditor video={baseVideo} />);
    expect(screen.getByTestId("metadata-title-input")).toHaveValue(
      "Original title",
    );
    expect(screen.getByTestId("metadata-description-input")).toHaveValue(
      "Original description",
    );
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("disables all Save buttons until the user changes a value", () => {
    render(<VideoMetadataEditor video={baseVideo} />);
    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    saveButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("enables the title Save button after the title is edited", async () => {
    const user = userEvent.setup();
    render(<VideoMetadataEditor video={baseVideo} />);
    const titleInput = screen.getByTestId("metadata-title-input");
    await user.clear(titleInput);
    await user.type(titleInput, "New title");
    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    expect(saveButtons[0]).not.toBeDisabled();
  });

  it("calls the mutation with just the title and refreshes on save", async () => {
    const user = userEvent.setup();
    render(<VideoMetadataEditor video={baseVideo} />);
    const titleInput = screen.getByTestId("metadata-title-input");
    await user.clear(titleInput);
    await user.type(titleInput, "Edited title");
    // The first Save button in the DOM is the title section's.
    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    await user.click(saveButtons[0]!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: "vid_1",
        body: { title: "Edited title" },
      });
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("clears the description when saved with an empty value (sends null)", async () => {
    const user = userEvent.setup();
    render(<VideoMetadataEditor video={baseVideo} />);
    const descInput = screen.getByTestId("metadata-description-input");
    await user.clear(descInput);
    // Save buttons: [title, description, tags]
    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    await user.click(saveButtons[1]!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: "vid_1",
        body: { description: null },
      });
    });
  });

  it("adds a tag on Enter and removes it on click", async () => {
    const user = userEvent.setup();
    render(<VideoMetadataEditor video={baseVideo} />);
    const tagInput = screen.getByTestId("metadata-tag-input");
    await user.type(tagInput, "gamma");
    await user.keyboard("{Enter}");
    expect(screen.getByText("gamma")).toBeInTheDocument();
    // Click the X on the gamma chip to remove it.
    const removeButton = screen.getByLabelText("Remove tag gamma");
    await user.click(removeButton);
    expect(screen.queryByText("gamma")).not.toBeInTheDocument();
  });

  it("calls the mutation with the full tag list (including order) on save", async () => {
    const user = userEvent.setup();
    render(<VideoMetadataEditor video={baseVideo} />);
    const tagInput = screen.getByTestId("metadata-tag-input");
    await user.type(tagInput, "gamma");
    await user.keyboard("{Enter}");
    // Save buttons: [title, description, tags]
    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    await user.click(saveButtons[2]!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: "vid_1",
        body: { tags: ["alpha", "beta", "gamma"] },
      });
    });
  });

  it("discards a dirty title back to the server value", async () => {
    const user = userEvent.setup();
    render(<VideoMetadataEditor video={baseVideo} />);
    const titleInput = screen.getByTestId("metadata-title-input");
    await user.clear(titleInput);
    await user.type(titleInput, "Will be discarded");
    // Two buttons in the title row now: Discard, Save.
    const discardButtons = screen.getAllByRole("button", { name: /discard/i });
    await user.click(discardButtons[0]!);
    expect(titleInput).toHaveValue("Original title");
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("shows an error toast when the mutation fails", async () => {
    const toast = (await import("sonner")).toast;
    mockMutateAsync.mockRejectedValueOnce(new Error("Server rejected the change."));
    const user = userEvent.setup();
    render(<VideoMetadataEditor video={baseVideo} />);
    const titleInput = screen.getByTestId("metadata-title-input");
    await user.clear(titleInput);
    await user.type(titleInput, "Try to save");
    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    await user.click(saveButtons[0]!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Server rejected the change.");
    });
  });
});
