/**
 * Unit tests for the AssemblyAI wrapper.
 *
 * Pure tests only — they exercise the helpers that don't require a real
 * AssemblyAI API key. End-to-end behaviour against the real SDK lives in
 * the integration test (`apps/worker/src/jobs/transcription.test.ts`).
 */
import { describe, expect, it } from "vitest";
import type { Transcript } from "assemblyai";
import {
  buildAaiClient,
  normaliseAaiTranscript,
} from "./assemblyai.js";

describe("buildAaiClient", () => {
  it("throws [AAI_AUTH] when apiKey is empty", () => {
    expect(() => buildAaiClient("")).toThrow(/AAI_AUTH/);
  });

  it("returns an AssemblyAI client when apiKey is non-empty", () => {
    const client = buildAaiClient("test-key-12345678901234567890");
    expect(client).toBeDefined();
    expect(typeof client.transcripts.transcribe).toBe("function");
  });
});

describe("normaliseAaiTranscript", () => {
  // `Partial<Transcript>` doesn't allow `null` for fields whose declared
  // type is `T | undefined` (rather than `T | null | undefined`). For test
  // overrides we widen the type so we can deliberately pass null where the
  // SDK sometimes returns it.
  type Overrides = {
    [K in keyof Transcript]?: Transcript[K] | null;
  };
  const makeTranscript = (overrides: Overrides = {}): Transcript =>
    ({
      acoustic_model: "universal",
      audio_url: "https://example.com/audio.mp3",
      text: "Hello world.",
      words: null,
      chapters: null,
      status: "completed",
      error: null,
      language_code: "en",
      language_confidence: null,
      language_detection: true,
      audio_duration: 12.5,
      ...overrides,
    }) as Transcript;

  it("converts word timestamps from seconds (float) to milliseconds (int)", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({
        words: [
          {
            text: "Hello",
            start: 0.123,
            end: 0.456,
            confidence: 0.95,
            speaker: null,
            channel: null,
            punctuated_word: "Hello",
          } as never,
          {
            text: "world.",
            start: 0.789,
            end: 1.234,
            confidence: 0.92,
            speaker: null,
            channel: null,
            punctuated_word: "world.",
          } as never,
        ],
      }),
    );

    expect(result.words).toEqual([
      {
        text: "Hello",
        startMs: 123,
        endMs: 456,
        confidence: 0.95,
      },
      {
        text: "world.",
        startMs: 789,
        endMs: 1234,
        confidence: 0.92,
      },
    ]);
  });

  it("converts chapter timestamps from seconds to milliseconds", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({
        chapters: [
          {
            start: 0,
            end: 30.5,
            gist: "Introduction",
            headline: "Opening line",
            summary: "The host welcomes the audience.",
          } as never,
        ],
      }),
    );

    expect(result.chapters).toEqual([
      {
        startMs: 0,
        endMs: 30500,
        gist: "Introduction",
        headline: "Opening line",
        summary: "The host welcomes the audience.",
      },
    ]);
  });

  it("reduces regional language codes to ISO 639-1 (en_us → en)", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({ language_code: "en_us" }),
    );
    expect(result.languageCode).toBe("en");
  });

  it("handles Spanish, Hindi, Tamil, and other regional codes", () => {
    expect(
      normaliseAaiTranscript(makeTranscript({ language_code: "es_es" }))
        .languageCode,
    ).toBe("es");
    expect(
      normaliseAaiTranscript(makeTranscript({ language_code: "hi_in" }))
        .languageCode,
    ).toBe("hi");
    expect(
      normaliseAaiTranscript(makeTranscript({ language_code: "ta_in" }))
        .languageCode,
    ).toBe("ta");
  });

  it("defaults language to 'en' when AssemblyAI couldn't detect", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({ language_code: null }),
    );
    expect(result.languageCode).toBe("en");
  });

  it("converts audio_duration from seconds (float) to milliseconds (int)", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({ audio_duration: 1532.846 }),
    );
    expect(result.durationMs).toBe(1532846);
  });

  it("defaults duration to 0 when audio_duration is null", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({ audio_duration: null }),
    );
    expect(result.durationMs).toBe(0);
  });

  it("returns an empty words array when the SDK returns null", () => {
    const result = normaliseAaiTranscript(makeTranscript({ words: null }));
    expect(result.words).toEqual([]);
  });

  it("returns an empty chapters array when the SDK returns null", () => {
    const result = normaliseAaiTranscript(makeTranscript({ chapters: null }));
    expect(result.chapters).toEqual([]);
  });

  it("normalises empty gists/headlines/summaries to empty strings", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({
        chapters: [
          {
            start: 0,
            end: 10,
            gist: "",
            headline: "",
            summary: "",
          } as never,
        ],
      }),
    );
    expect(result.chapters[0]).toEqual({
      startMs: 0,
      endMs: 10000,
      gist: "",
      headline: "",
      summary: "",
    });
  });

  it("sets status to 'completed' on the normalised shape", () => {
    const result = normaliseAaiTranscript(makeTranscript({ status: "completed" }));
    expect(result.status).toBe("completed");
  });

  it("preserves the transcript ID", () => {
    const result = normaliseAaiTranscript(
      makeTranscript({ id: "abc12345" } as Overrides),
    );
    expect(result.id).toBe("abc12345");
  });
});