/**
 * Unit tests for `LlmOutputSchema` + `parseLlmOutput` +
 * `computeChapterBudget`.
 *
 * The schema is the single source of truth for "what the LLM is allowed
 * to emit". These tests lock down the contract so a future schema
 * change is a deliberate edit, not an accidental widening.
 */
import { describe, it, expect } from "vitest";
import {
  LlmOutputSchema,
  computeChapterBudget,
  parseLlmOutput,
  LlmParseError,
  MAX_CHAPTERS,
  MIN_CHAPTER_GAP_MS,
} from "./schemas.js";

const validOutput = {
  summary: "A short summary of the video content for YouTube.",
  chapters: [
    { startMs: 0, title: "Intro" },
    { startMs: 12_000, title: "The main argument" },
    { startMs: 36_000, title: "Wrap-up" },
  ],
};

describe("LlmOutputSchema", () => {
  describe("happy path", () => {
    it("accepts a valid 3-chapter output", () => {
      const result = LlmOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it("accepts up to 30 chapters with valid gaps", () => {
      const chapters = Array.from({ length: 30 }, (_, i) => ({
        startMs: i * 15_000,
        title: `Chapter ${i + 1}`,
      }));
      const result = LlmOutputSchema.safeParse({ summary: "ok", chapters });
      expect(result.success).toBe(true);
    });

    it("accepts a summary at exactly 280 chars", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "a".repeat(280),
        chapters: validOutput.chapters,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a chapter title at exactly 100 chars", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "a".repeat(100) },
          { startMs: 12_000, title: "ok" },
          { startMs: 24_000, title: "ok" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts 3 chapters spaced only 30 s apart — content-aware framing permits tight genuine topic shifts", () => {
      // A 60-min video with 3 closely-spaced genuine topic shifts
      // (e.g. a panel discussion where 3 speakers each talk for
      // 30 s back-to-back) should pass. Per-video minGap enforcement
      // was deliberately removed in favour of trusting the
      // content-aware prompt; the YouTube 10 s floor is the only
      // spacing rule.
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "Panel intro" },
          { startMs: 30_000, title: "Speaker 1" },
          { startMs: 60_000, title: "Speaker 2" },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("structural rejection", () => {
    it("rejects when summary is missing", () => {
      const result = LlmOutputSchema.safeParse({ chapters: validOutput.chapters });
      expect(result.success).toBe(false);
    });

    it("rejects when chapters is missing", () => {
      const result = LlmOutputSchema.safeParse({ summary: "ok" });
      expect(result.success).toBe(false);
    });

    it("rejects when summary is longer than 280 chars", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "a".repeat(281),
        chapters: validOutput.chapters,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("summary"))).toBe(
          true,
        );
      }
    });

    it("rejects when chapter title is empty", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "" },
          { startMs: 12_000, title: "ok" },
          { startMs: 24_000, title: "ok" },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects when chapter title is longer than 100 chars", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "a".repeat(101) },
          { startMs: 12_000, title: "ok" },
          { startMs: 24_000, title: "ok" },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative startMs", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: -1, title: "bad" },
          { startMs: 12_000, title: "ok" },
          { startMs: 24_000, title: "ok" },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer startMs", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0.5, title: "bad" },
          { startMs: 12_000, title: "ok" },
          { startMs: 24_000, title: "ok" },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("YouTube-rule refinements", () => {
    it("rejects fewer than 3 chapters", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "Intro" },
          { startMs: 12_000, title: "Main" },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toContain("3");
      }
    });

    it("rejects when chapter count exceeds the max (30)", () => {
      const chapters = Array.from({ length: 31 }, (_, i) => ({
        startMs: i * 15_000,
        title: `Chapter ${i + 1}`,
      }));
      const result = LlmOutputSchema.safeParse({ summary: "ok", chapters });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toMatch(/30/);
      }
    });

    it("rejects 31 chapters even if the gaps are wide enough — the cap wins", () => {
      const chapters = Array.from({ length: 31 }, (_, i) => ({
        startMs: i * 300_000,
        title: `Chapter ${i + 1}`,
      }));
      const result = LlmOutputSchema.safeParse({ summary: "ok", chapters });
      expect(result.success).toBe(false);
    });

    it("rejects when first chapter is not at 0 ms", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 5_000, title: "Intro" },
          { startMs: 20_000, title: "Main" },
          { startMs: 35_000, title: "Wrap" },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toContain("0");
      }
    });

    it("rejects when two consecutive chapters are less than 10 s apart", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "A" },
          { startMs: 9_999, title: "B" },
          { startMs: 25_000, title: "C" },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.message).toContain("10");
      }
    });

    it("rejects when last chapter startMs exceeds video duration", () => {
      const bad = JSON.stringify({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "A" },
          { startMs: 12_000, title: "B" },
          { startMs: 50_000, title: "C" },
        ],
      });
      let caught: unknown;
      try {
        parseLlmOutput(bad, 40_000);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(LlmParseError);
      expect((caught as LlmParseError).message).toContain("video duration");
    });

    it("accepts exactly 10 000 ms gap", () => {
      const result = LlmOutputSchema.safeParse({
        summary: "ok",
        chapters: [
          { startMs: 0, title: "A" },
          { startMs: 10_000, title: "B" },
          { startMs: 20_000, title: "C" },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("parseLlmOutput", () => {
  it("parses a valid JSON string into the typed shape", () => {
    const out = parseLlmOutput(JSON.stringify(validOutput), 120_000);
    expect(out.summary).toBe(validOutput.summary);
    expect(out.chapters).toEqual(validOutput.chapters);
  });

  it("throws LlmParseError on invalid JSON", () => {
    let caught: unknown;
    try {
      parseLlmOutput("this is not json {", 120_000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LlmParseError);
    expect((caught as LlmParseError).message).toContain("not valid JSON");
    expect((caught as LlmParseError).rawText).toBe("this is not json {");
  });

  it("throws LlmParseError on shape mismatch", () => {
    const bad = JSON.stringify({ summary: "ok" /* missing chapters */ });
    let caught: unknown;
    try {
      parseLlmOutput(bad, 120_000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LlmParseError);
    expect((caught as LlmParseError).message).toContain("shape");
    expect((caught as LlmParseError).rawText).toBe(bad);
  });

  it("throws LlmParseError on YouTube-rule violation with the specific rule in the message", () => {
    const bad = JSON.stringify({
      summary: "ok",
      chapters: [
        { startMs: 0, title: "A" },
        { startMs: 5_000, title: "B" }, // too close
        { startMs: 20_000, title: "C" },
      ],
    });
    let caught: unknown;
    try {
      parseLlmOutput(bad, 120_000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LlmParseError);
    expect((caught as LlmParseError).message).toContain("10");
  });
});

describe("computeChapterBudget", () => {
  it("clamps to 3 chapters for very short videos", () => {
    // 30 s clip — duration-derived density floors at the YouTube min.
    const b = computeChapterBudget(30_000);
    expect(b.targetMin).toBe(3);
    expect(b.target).toBe(3);
    // spread = ceil(3 * 0.2) = 1, so targetMax = 3 + 1 = 4
    expect(b.targetMax).toBe(4);
  });

  it("targets ~3 chapters for a 2-minute video", () => {
    const b = computeChapterBudget(120_000);
    expect(b.target).toBe(3);
  });

  it("targets ~3 chapters for a 10-minute video (600/180=3.33→3)", () => {
    const b = computeChapterBudget(10 * 60_000);
    // 600 / 180 = 3.33 → round → 3
    expect(b.target).toBe(3);
    expect(b.targetMin).toBe(3);
    // spread = ceil(3 * 0.2) = 1, so targetMax = 4
    expect(b.targetMax).toBe(4);
  });

  it("scales to ~10 chapters for a 30-minute video", () => {
    const b = computeChapterBudget(30 * 60_000);
    expect(b.target).toBe(10);
    // spread = ceil(10 * 0.2) = 2, so range is 8–12
    expect(b.targetMin).toBe(8);
    expect(b.targetMax).toBe(12);
  });

  it("targets ~20 chapters for an hour-long video — not capped at old 12 limit", () => {
    // 3600 / 180 = 20; new MAX_CHAPTERS=30 so no clamping here
    const b = computeChapterBudget(60 * 60_000);
    expect(b.target).toBe(20);
    // spread = ceil(20 * 0.2) = 4, so range is 16–24
    expect(b.targetMin).toBe(16);
    expect(b.targetMax).toBe(24);
  });

  it("grows target monotonically (clamped at MAX_CHAPTERS) as duration grows", () => {
    const durations = [
      60_000,
      5 * 60_000,
      10 * 60_000,
      20 * 60_000,
      30 * 60_000,
      45 * 60_000,
      60 * 60_000,
      2 * 60 * 60_000,
    ];
    const targets = durations.map((d) => computeChapterBudget(d).target);
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]).toBeGreaterThanOrEqual(targets[i - 1]!);
      expect(targets[i]).toBeLessThanOrEqual(MAX_CHAPTERS);
    }
  });

  it("does not include minGapMs anymore — content-aware framing handles spacing", () => {
    const b = computeChapterBudget(30 * 60_000);
    expect((b as unknown as Record<string, unknown>).minGapMs).toBeUndefined();
  });
});
