/**
 * Tests for the voice formatters. Lifted from the video detail page
 * alongside the Publish sheet (which now shares `formatPrivacy`); the
 * page's other formatters followed. The formatters are pure and
 * dependency-free, so plain vitest is enough.
 */
import { describe, it, expect } from "vitest";

import {
  formatBytes,
  formatCommentPolicy,
  formatDuration,
  formatLicense,
  formatPrivacy,
} from "./voice.js";

describe("formatPrivacy", () => {
  it("renders 'Public — anyone can watch' for public", () => {
    expect(formatPrivacy("public")).toBe("Public — anyone can watch");
  });

  it("renders 'Unlisted — only people with the link' for unlisted", () => {
    expect(formatPrivacy("unlisted")).toBe(
      "Unlisted — only people with the link",
    );
  });

  it("renders 'Private — only you' for private", () => {
    expect(formatPrivacy("private")).toBe("Private — only you");
  });

  it("falls back to the raw string for an unknown value (forward-compat)", () => {
    expect(formatPrivacy("draft")).toBe("draft");
  });
});

describe("formatCommentPolicy", () => {
  it("renders 'Everyone can comment' for allowAll", () => {
    expect(formatCommentPolicy("allowAll")).toBe("Everyone can comment");
  });

  it("renders 'All comments held for review' for holdAll", () => {
    expect(formatCommentPolicy("holdAll")).toBe(
      "All comments held for review",
    );
  });

  it("renders 'Comments off' for disable", () => {
    expect(formatCommentPolicy("disable")).toBe("Comments off");
  });
});

describe("formatLicense", () => {
  it("renders the standard YouTube label", () => {
    expect(formatLicense("standard")).toBe("Standard YouTube License");
  });

  it("renders the Creative Commons label", () => {
    expect(formatLicense("creativeCommon")).toBe(
      "Creative Commons — Attribution",
    );
  });
});

describe("formatBytes", () => {
  it("renders bytes under 1 KB as raw bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("renders KB with one decimal", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("renders MB with one decimal", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("renders GB with one decimal", () => {
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
  });
});

describe("formatDuration", () => {
  it("renders under-an-hour durations as M:SS", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(125)).toBe("2:05");
  });

  it("renders hour+ durations as H:MM:SS", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("rounds fractional seconds to the nearest whole second", () => {
    expect(formatDuration(65.4)).toBe("1:05");
    expect(formatDuration(65.6)).toBe("1:06");
  });

  it("zero-pads seconds under 10", () => {
    expect(formatDuration(61)).toBe("1:01");
  });
});
