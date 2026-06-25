/**
 * Unit tests for the internal-license → YouTube-API license translator.
 *
 * Regression: the API was sending `status.license = "standard"` to
 * YouTube, which the Data API v3 rejects with HTTP 400
 * `INVALID_METADATA` because its enum is `"youtube" | "creativeCommon"`.
 * This test pins the translation so a future refactor that drops
 * `toYouTubeLicense` at the publish-site cannot reintroduce the bug.
 */
import { describe, it, expect } from "vitest";
import { toYouTubeLicense } from "./youtube-api.js";

describe("toYouTubeLicense", () => {
  it("maps the internal default 'standard' to YouTube's 'youtube'", () => {
    // The default the DB row / wire DTO / UI use. Sending this raw is
    // the exact bug — the test pins that we translate it.
    expect(toYouTubeLicense("standard")).toBe("youtube");
  });

  it("passes 'creativeCommon' through unchanged", () => {
    expect(toYouTubeLicense("creativeCommon")).toBe("creativeCommon");
  });

  it("falls back to 'youtube' for unknown internal values", () => {
    // A future schema migration that adds a new license value before
    // this mapper is updated shouldn't crash the worker. The fallback
    // matches YouTube's own default for an unspecified license.
    expect(toYouTubeLicense("")).toBe("youtube");
    expect(toYouTubeLicense("totally-unknown")).toBe("youtube");
  });

  it("only ever returns a valid YouTube-API enum value", () => {
    // Defensive: every code path returns one of the two values YouTube
    // accepts. A typo in the mapper (e.g. `"youTube"`) would silently
    // ship a 400 — this catches it at unit-test time.
    const valid = new Set(["youtube", "creativeCommon"]);
    for (const input of [
      "standard",
      "creativeCommon",
      "",
      "youtube",
      "Standard", // case-sensitive on purpose — internal enum is upper-snake
      "unknown",
    ]) {
      expect(valid.has(toYouTubeLicense(input))).toBe(true);
    }
  });
});