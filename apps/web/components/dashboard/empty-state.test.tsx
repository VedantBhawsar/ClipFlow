import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state.js";

describe("EmptyState", () => {
  it("shows the connect-channel prompt when not connected", () => {
    render(<EmptyState connected={false} />);
    expect(
      screen.getByText(/connect your youtube channel above/i),
    ).toBeInTheDocument();
    // The Upload button is disabled until the channel is connected; the
    // YouTubeConnectCard rendered above handles prompting the user.
    expect(
      screen.getByRole("button", { name: /upload your first video/i }),
    ).toBeDisabled();
  });

  it("shows the upload prompt when connected", () => {
    render(<EmptyState connected={true} />);
    expect(screen.getByText("No videos yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /upload your first video/i }),
    ).toBeEnabled();
  });

  it("defaults to the not-connected state when no prop is given", () => {
    render(<EmptyState />);
    expect(
      screen.getByText(/connect your youtube channel above/i),
    ).toBeInTheDocument();
  });
});
