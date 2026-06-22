import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state.js";

describe("EmptyState", () => {
  it("shows the connect-channel prompt when not connected", () => {
    render(<EmptyState connected={false} />);
    expect(
      screen.getByText("Connect your channel to get started"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /connect your channel/i }),
    ).toHaveAttribute("href", "/youtube-connect");
  });

  it("shows the upload prompt when connected", () => {
    render(<EmptyState connected={true} />);
    expect(screen.getByText("No videos yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /upload your first video/i }),
    ).toBeDisabled();
  });

  it("defaults to the not-connected state when no prop is given", () => {
    render(<EmptyState />);
    expect(
      screen.getByText("Connect your channel to get started"),
    ).toBeInTheDocument();
  });
});
