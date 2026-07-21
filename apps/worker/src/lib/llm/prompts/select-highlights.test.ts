/**
 * Unit tests for `buildSelectHighlightsPrompt`.
 *
 * The prompt is the contract between the worker and the LLM. These
 * tests lock down the content-aware framing:
 *   - AssemblyAI anchors (with gist + headline + summary) are
 *     rendered as the PRIMARY signal, not a starting point
 *   - the per-video DENSITY hint is presented as a hint, not a target
 *   - the LLM is told that the number of chapters is determined by
 *     content, not video length
 *   - the YouTube hard floors (first=0, max 12, min 10 s gap) are
 *     always present
 *   - transcript text appears verbatim in the user prompt
 */
import { describe, it, expect } from "vitest";
import { buildSelectHighlightsPrompt } from "./select-highlights.js";
import type { AaiChapter } from "../../transcription/assemblyai.js";
import {
  computeChapterBudget,
  MAX_CHAPTERS,
  MIN_CHAPTER_GAP_MS,
} from "../schemas.js";

const baseAaiChapters: AaiChapter[] = [
  { startMs: 0, endMs: 5_000, gist: "intro", headline: "Intro", summary: "" },
];

const baseInput = {
  transcriptText: "Hello world. This is the transcript.",
  aaiChapters: baseAaiChapters,
  languageCode: "en",
};

describe("buildSelectHighlightsPrompt", () => {
  describe("content-aware framing", () => {
    it("labels the AssemblyAI anchors as the PRIMARY signal", () => {
      const { systemPrompt, userPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60_000,
        budget: computeChapterBudget(60_000),
      });
      expect(systemPrompt).toMatch(/PRIMARY SIGNAL/);
      expect(systemPrompt).toContain("topic-segmentation");
      expect(userPrompt).toMatch(/PRIMARY SIGNAL/);
    });

    it("instructs the LLM to keep / merge / split the anchors rather than invent new boundaries", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60_000,
        budget: computeChapterBudget(60_000),
      });
      expect(systemPrompt).toContain("KEEP");
      expect(systemPrompt).toContain("MERGE");
      expect(systemPrompt).toContain("SPLIT");
      // Boundaries must be grounded in the anchors
      expect(systemPrompt).toContain("Do NOT invent boundaries");
    });

    it("tells the LLM the number of chapters is content-driven, not length-driven", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 30 * 60_000,
        budget: computeChapterBudget(30 * 60_000),
      });
      expect(systemPrompt).toContain("determined by the CONTENT");
      expect(systemPrompt).toContain("not by the video length");
    });

    it("permits fewer chapters than the density hint when anchors cover the same topic", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 30 * 60_000,
        budget: computeChapterBudget(30 * 60_000),
      });
      expect(systemPrompt).toContain("FEWER chapters");
    });

    it("permits more chapters than the density hint when content warrants it", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 30 * 60_000,
        budget: computeChapterBudget(30 * 60_000),
      });
      expect(systemPrompt).toContain("MORE chapters");
    });

    it("allows rapid topic transitions (no per-video spacing rule)", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60 * 60_000,
        budget: computeChapterBudget(60 * 60_000),
      });
      expect(systemPrompt).toContain("rapid transitions");
    });
  });

  describe("anchor rendering", () => {
    it("renders every AssemblyAI field (time range, headline, gist, summary)", () => {
      const aaiChapters: AaiChapter[] = [
        {
          startMs: 0,
          endMs: 92_000,
          gist: "hallucination causes",
          headline: "Why current AI models hallucinate",
          summary:
            "Discussion of how training data quality and token sampling lead to factual errors.",
        },
      ];
      const { userPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 5 * 60_000,
        budget: computeChapterBudget(5 * 60_000),
        aaiChapters,
      });
      expect(userPrompt).toContain("Anchor 1: [0:00 – 1:32]");
      expect(userPrompt).toContain("Headline: Why current AI models hallucinate");
      expect(userPrompt).toContain("Gist:     hallucination causes");
      expect(userPrompt).toContain(
        "Summary:  Discussion of how training data quality",
      );
    });

    it("renders multiple anchors with blank-line separators", () => {
      const aaiChapters: AaiChapter[] = [
        {
          startMs: 0,
          endMs: 30_000,
          gist: "intro",
          headline: "Intro",
          summary: "",
        },
        {
          startMs: 30_000,
          endMs: 90_000,
          gist: "main",
          headline: "Main",
          summary: "",
        },
      ];
      const { userPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 5 * 60_000,
        budget: computeChapterBudget(5 * 60_000),
        aaiChapters,
      });
      expect(userPrompt).toContain("Anchor 1: [0:00 – 0:30]");
      expect(userPrompt).toContain("Anchor 2: [0:30 – 1:30]");
    });

    it("formats hour-long anchor ranges with h:mm:ss", () => {
      const aaiChapters: AaiChapter[] = [
        {
          startMs: 3_725_000,
          endMs: 4_200_000,
          gist: "deep dive",
          headline: "Deep dive",
          summary: "",
        },
      ];
      const { userPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 70 * 60_000,
        budget: computeChapterBudget(70 * 60_000),
        aaiChapters,
      });
      expect(userPrompt).toContain("[1:02:05 – 1:10:00]");
    });

    it("omits empty AssemblyAI fields rather than render empty bullets", () => {
      const aaiChapters: AaiChapter[] = [
        {
          startMs: 0,
          endMs: 30_000,
          gist: "",
          headline: "Just a headline",
          summary: "",
        },
      ];
      const { userPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 5 * 60_000,
        budget: computeChapterBudget(5 * 60_000),
        aaiChapters,
      });
      expect(userPrompt).toContain("Headline: Just a headline");
      expect(userPrompt).not.toContain("Gist:");
      expect(userPrompt).not.toContain("Summary:");
    });

    it("falls back to a 'split from scratch' note when AssemblyAI returned no anchors", () => {
      const { userPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 5 * 60_000,
        budget: computeChapterBudget(5 * 60_000),
        aaiChapters: [],
      });
      expect(userPrompt).toContain("no AssemblyAI anchors available");
    });
  });

  describe("density hint", () => {
    it("names the target range for a 5-minute video", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 5 * 60_000,
        budget: computeChapterBudget(5 * 60_000),
      });
      expect(systemPrompt).toContain("3–5");
    });

    it("names the target range for a 30-minute video", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 30 * 60_000,
        budget: computeChapterBudget(30 * 60_000),
      });
      expect(systemPrompt).toContain("8–12");
    });

    it("labels the density hint as a hint, not a target", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 30 * 60_000,
        budget: computeChapterBudget(30 * 60_000),
      });
      expect(systemPrompt).toContain("DENSITY HINT");
      expect(systemPrompt).toContain("not a target");
    });
  });

  describe("YouTube hard floors", () => {
    it("always mentions the 12-chapter cap", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60_000,
        budget: computeChapterBudget(60_000),
      });
      expect(systemPrompt).toContain(String(MAX_CHAPTERS));
    });

    it("always mentions the 10-second YouTube floor", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60_000,
        budget: computeChapterBudget(60_000),
      });
      expect(systemPrompt).toContain(`${MIN_CHAPTER_GAP_MS} ms`);
      expect(systemPrompt).toContain("10 seconds");
    });

    it("always mentions the first chapter must start at 0 ms", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60_000,
        budget: computeChapterBudget(60_000),
      });
      expect(systemPrompt).toContain("chapters[0].startMs MUST be exactly 0");
    });

    it("always mentions the 100-char title limit", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60_000,
        budget: computeChapterBudget(60_000),
      });
      expect(systemPrompt).toContain("≤ 100 characters");
    });
  });

  describe("transcript + language", () => {
    it("embeds the transcript text verbatim in the user prompt", () => {
      const transcript = "This is a unique transcript marker 12345-xyzzy.";
      const { userPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        transcriptText: transcript,
        durationMs: 5 * 60_000,
        budget: computeChapterBudget(5 * 60_000),
      });
      expect(userPrompt).toContain(transcript);
    });

    it("echoes the language code in the system prompt", () => {
      const { systemPrompt } = buildSelectHighlightsPrompt({
        ...baseInput,
        durationMs: 60_000,
        budget: computeChapterBudget(60_000),
        languageCode: "hi",
      });
      expect(systemPrompt).toContain('"hi"');
    });
  });
});
