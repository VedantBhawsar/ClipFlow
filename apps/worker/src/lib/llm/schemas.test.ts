/**
 * Unit tests for `LlmOutputSchema` + `parseLlmOutput`.
 *
 * The schema is the single source of truth for "what the LLM is allowed
 * to emit". These tests lock down the contract so a future schema
 * change is a deliberate edit, not an accidental widening.
 */
import { describe, it, expect } from "vitest";
import { LlmOutputSchema, parseLlmOutput, LlmParseError } from "./schemas.js";

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

    it("accepts up to 12 chapters with valid gaps", () => {
      const chapters = Array.from({ length: 12 }, (_, i) => ({
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

    it("rejects more than 12 chapters", () => {
      const chapters = Array.from({ length: 13 }, (_, i) => ({
        startMs: i * 11_000,
        title: `Ch ${i + 1}`,
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
    const out = parseLlmOutput(JSON.stringify(validOutput));
    expect(out.summary).toBe(validOutput.summary);
    expect(out.chapters).toEqual(validOutput.chapters);
  });

  it("throws LlmParseError on invalid JSON", () => {
    let caught: unknown;
    try {
      parseLlmOutput("this is not json {");
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
      parseLlmOutput(bad);
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
      parseLlmOutput(bad);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LlmParseError);
    expect((caught as LlmParseError).message).toContain("10");
  });
});