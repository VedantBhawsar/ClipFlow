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
import { formatChaptersForDescription, toYouTubeLicense } from "./youtube-api.js";

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

describe("formatChaptersForDescription", () => {
  it("returns empty string for null", () => {
    expect(formatChaptersForDescription(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatChaptersForDescription(undefined)).toBe("");
  });

  it("returns empty string for fewer than 3 chapters", () => {
    expect(formatChaptersForDescription([{ startMs: 0, title: "Intro" }])).toBe("");
    expect(formatChaptersForDescription([{ startMs: 0, title: "Intro" }, { startMs: 60000, title: "Middle" }])).toBe("");
  });

  it("formats chapters with MM:SS timestamps", () => {
    const chapters = [
      { startMs: 0, title: "Intro" },
      { startMs: 65000, title: "Getting Started" },
      { startMs: 185000, title: "Advanced Tips" },
    ];
    const result = formatChaptersForDescription(chapters);
    expect(result).toContain("0:00 Intro");
    expect(result).toContain("1:05 Getting Started");
    expect(result).toContain("3:05 Advanced Tips");
    expect(result.startsWith("\n\n")).toBe(true);
  });

  it("uses H:MM:SS for chapters over an hour", () => {
    const chapters = [
      { startMs: 0, title: "Intro" },
      { startMs: 3600000, title: "One Hour Mark" },
      { startMs: 3665000, title: "One Hour Five" },
    ];
    const result = formatChaptersForDescription(chapters);
    expect(result).toContain("1:00:00 One Hour Mark");
    expect(result).toContain("1:01:05 One Hour Five");
  });

  // Regression for the v1.5 → v1.5.2 chapter-upload bug. The
  // `chaptersJson` JSON column is persisted as `{ summary,
  // chapters[] }`; before this fix, the publish path passed the
  // wrapper object through to formatChaptersForDescription, which
  // walked `.summary` + `.chapters` and emitted `NaN:NaN` lines that
  // YouTube didn't recognize — so chapters silently disappeared.
  // Today the helper accepts the wrapper shape natively (callers
  // can also pass the inner array — both are equivalent).
  it("accepts the { summary, chapters[] } wrapper shape directly", () => {
    const wrapped = {
      summary: "A walkthrough of the chapter-generation pipeline.",
      chapters: [
        { startMs: 0, title: "Intro" },
        { startMs: 65000, title: "Getting Started" },
        { startMs: 185000, title: "Advanced Tips" },
      ],
    };
    const result = formatChaptersForDescription(wrapped);
    expect(result).toContain("0:00 Intro");
    expect(result).toContain("1:05 Getting Started");
    expect(result).toContain("3:05 Advanced Tips");
    expect(result.startsWith("\n\n")).toBe(true);
    expect(result).not.toContain("NaN");
  });

  it("returns empty string for a wrapper with fewer than 3 chapters", () => {
    expect(
      formatChaptersForDescription({
        summary: "too few",
        chapters: [{ startMs: 0, title: "Intro" }],
      }),
    ).toBe("");
  });

  it("returns empty string for a wrapper whose chapters field is missing", () => {
    expect(
      formatChaptersForDescription({ summary: "no chapters here" }),
    ).toBe("");
  });

  // Regression for the runtime hang observed on
  //   POST /api/videos/:id/publish
  // where the server log printed
  //   ERROR: Unhandled promise rejection
  //   detail: { message: "chapters.map is not a function" }
  // and the request sat pending until socket timeout.
  //
  // Cause: a payload reached formatChaptersForDescription whose
  // `chapters` field was an object, not an array. The helper treated
  // it as truthy and called `.map()` on it → TypeError → Express 4
  // swallowed the async rejection → request hung. The fix is the
  // `Array.isArray(list)` guard before `.map()`; this test pins
  // every "object instead of array" shape to a no-op return.
  it("returns empty string when the wrapper's chapters field is an object, not an array", () => {
    // A partial migration or a future payload re-wrap could land here:
    // the outer shape is the right one, but the inner `chapters` is
    // something other than `Chapter[]`. Must NOT throw.
    expect(
      formatChaptersForDescription({
        summary: "ok",
        chapters: { 0: { startMs: 0, title: "Intro" } },
      }),
    ).toBe("");
    expect(
      formatChaptersForDescription({
        summary: "ok",
        chapters: "not-an-array",
      }),
    ).toBe("");
    expect(
      formatChaptersForDescription({
        summary: "ok",
        chapters: 42,
      }),
    ).toBe("");
    expect(
      formatChaptersForDescription({
        summary: "ok",
        chapters: null,
      }),
    ).toBe("");
  });

  it("returns empty string for a bare non-array input", () => {
    // Defensive: a caller that bypasses extractChapters and passes
    // something totally unexpected (string, number, plain object)
    // must not throw — it must just produce no chapters.
    expect(formatChaptersForDescription("" as never)).toBe("");
    expect(formatChaptersForDescription(42 as never)).toBe("");
    expect(formatChaptersForDescription({} as never)).toBe("");
  });
});