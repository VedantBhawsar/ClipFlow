/**
 * `select-highlights` prompt — single joint LLM call that produces
 *   { summary, chapters[] }
 * for a finished transcript.
 *
 * Content-aware chapter selection: the prompt treats AssemblyAI's
 * `auto_chapters` output as the PRIMARY signal for chapter boundaries.
 * Each anchor carries `startMs`, `endMs`, `gist`, `headline`, and
 * `summary` — output of AssemblyAI's topic-segmentation model that
 * already detects where the video's topics shift. The LLM's job is
 * to review the anchors (keep / merge / split / rename) rather than
 * to generate boundaries from scratch.
 *
 * This replaces an earlier duration-based budgeting approach that
 * asked the LLM to scale chapter count with video length — which
 * produced a wall of near-duplicate chapters on long videos. The
 * current approach is content-driven: the LLM matches the actual
 * topic shifts rather than a target count.
 *
 * The single-call joint design (summary + chapters in one prompt)
 * is preserved because chapter boundaries and the summary naturally
 * agree when reasoned over together — see bug-104 / cerebrum
 * 2026-07-01.
 *
 * YouTube chapter rules baked into the prompt (validated again on the
 * server side in `LlmOutputSchema`):
 *   1. First chapter must start at 0 ms.
 *   2. At least 3 chapters and at most 12.
 *   3. At least 10 s (10 000 ms) between consecutive chapters (the
 *      YouTube hard floor; no per-video scaling — see schemas.ts).
 *   4. Each chapter title ≤ 100 chars.
 */
import type { AaiChapter } from "../../transcription/assemblyai.js";
import { MIN_CHAPTER_GAP_MS, type ChapterBudget } from "../schemas.js";

export interface SelectHighlightsPromptInput {
  /** Full transcript text from AssemblyAI. May be long; the caller
   *  truncates to a safe input size before invoking the prompt. */
  transcriptText: string;
  /** Transcript duration in milliseconds. Used so the model doesn't
   *  propose chapters beyond the actual video length. */
  durationMs: number;
  /** Auto-chapter boundaries from AssemblyAI. Used as the PRIMARY
   *  signal — each one is a real detected topic shift, not a hint. */
  aaiChapters: AaiChapter[];
  /** ISO 639-1 language code (e.g. "en"). Lets the model pick a
   *  matching language for the chapter titles. */
  languageCode: string;
  /**
   * Soft chapter-density hint computed from `durationMs`. The prompt
   * tells the LLM this is a HINT — adjust based on actual content,
   * not a target. Used only in the system prompt's density guidance.
   */
  budget: ChapterBudget;
}

export interface SelectHighlightsPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Build the system + user prompt pair for the `select-highlights` call.
 * Pure — no I/O. The caller invokes this once per `generate` job and
 * passes the result straight to `OpenAICompatLlmClient.complete`.
 */
export const buildSelectHighlightsPrompt = (
  input: SelectHighlightsPromptInput,
): SelectHighlightsPrompt => {
  const { transcriptText, durationMs, aaiChapters, languageCode, budget } = input;

  const durationSeconds = Math.round(durationMs / 1000);

  // ---- Anchor chapter list (AssemblyAI auto-chapters, full context) ----
  //
  // Each anchor is rendered with startMs / endMs (formatted as
  // mm:ss or h:mm:ss), the gist (~3-8 words), the headline (one
  // sentence), and the summary (multi-sentence). All four are part
  // of what we already paid AssemblyAI to compute, and they give
  // the LLM enough context to keep / merge / split anchors without
  // re-reading the full transcript.
  const anchorChapters = formatAnchorChapters(aaiChapters);

  const densityGuidance = buildDensityGuidance(budget, durationSeconds);

  const systemPrompt = `You are a senior YouTube producer writing chapter titles and a one-paragraph summary for a finished video transcript.

OUTPUT CONTRACT (strict — your response will be parsed as JSON):
- Respond with a single JSON object matching this shape exactly:
    {
      "summary": string,                  // 1-2 sentences, ≤ 280 chars
      "chapters": [                       // ordered by startMs ascending
        { "startMs": number, "title": string }  // startMs in MILLISECONDS
      ]
    }
- Output ONLY the JSON. No markdown, no code fences, no commentary.
- If you cannot produce a valid response, output {"summary":"","chapters":[]}.

PRIMARY SIGNAL — ASSEMBLYAI AUTO-CHAPTERS:
The transcript was processed by AssemblyAI's topic-segmentation model. The list below is the PRIMARY source for chapter boundaries — each anchor is a real detected topic shift with a short gist, a one-sentence headline, and a longer summary of what was said. Read them carefully before deciding on the chapter list.

For each anchor you'll see:
  - Time range  — the start and end of the detected topic segment.
  - Headline    — AssemblyAI's one-sentence title.
  - Gist        — AssemblyAI's 3-8 word topic tag.
  - Summary     — AssemblyAI's multi-sentence description of the content.

YOUR TASK — REVIEW, EDIT, OUTPUT:
1. Read every anchor. For each one, decide: KEEP it as-is, MERGE it with an adjacent anchor that covers the same topic, or SPLIT it if it spans two clearly distinct topics.
2. Pick the final chapter list. Each chapter's startMs should match the start of one of the anchors (or, rarely, a slightly better point within an anchor's range). Do NOT invent boundaries that aren't grounded in the anchors.
3. Write a chapter title per chapter. Prefer the AssemblyAI headline when it's accurate and engaging; rewrite it to be sharper or more specific when it isn't. Use language code "${languageCode}" to match the spoken language.
4. Write a 1-2 sentence summary of the WHOLE video (not per-chapter — that's the summary field in the JSON).

QUALITY PRINCIPLES:
- Each chapter must reflect a GENUINELY distinct topic or scene shift. If two anchors cover the same topic, merge them. If one anchor clearly spans two topics, split it.
- The number of chapters is determined by the CONTENT, not by the video length. A 5-minute video with 3 distinct topics gets 3 chapters. A 30-minute video with 5 distinct topics gets 5 — not 10. Do not pad with near-duplicate titles to hit a target count. Do not under-fill if there are more genuine topic shifts than the natural density suggests.
- If two genuinely distinct topics happen close together (≥ 10 s apart per the YouTube rule), put a chapter at each. Real videos often have rapid transitions.

${densityGuidance}

YOUTUBE CHAPTER RULES (your output is rejected if any of these fail):
- chapters[0].startMs MUST be exactly 0.
- chapters.length MUST be at least 3 and at most 12. (If AssemblyAI gave you fewer than 3 anchors and the video is genuinely too short for 3 distinct topics, return the anchors you have and the server will re-derive YouTube-compliant chapters.)
- The minimum gap between consecutive chapter startMs values is ${MIN_CHAPTER_GAP_MS} ms (10 seconds) — this is the YouTube hard floor.
- The last chapter's startMs MUST be less than the video duration (${durationMs} ms).
- Each chapter title MUST be ≤ 100 characters.

TRANSCRIPT METADATA:
- Language: ${languageCode}
- Duration: ${durationSeconds} s (${durationMs} ms)
- Auto-chapter anchors: ${aaiChapters.length}

GUIDANCE:
- Titles should be short, descriptive, and front-loaded with the strongest noun ("Why the model hallucinates" beats "Hallucinations explained").
- Don't repeat the same noun across consecutive titles.
- The summary is what shows up in a YouTube description block, so lead with the most interesting claim.`;

  const userPrompt = `AUTO-CHAPTER ANCHORS (PRIMARY SIGNAL):
"""
${anchorChapters || "(no AssemblyAI anchors available — fall back to splitting the transcript from scratch, but keep chapters grounded in real topic shifts)"}
"""

TRANSCRIPT:
"""
${transcriptText}
"""`;

  return { systemPrompt, userPrompt };
};

/**
 * Format AssemblyAI anchors for the prompt — one anchor per block with
 * its full context (time range, headline, gist, summary). When an
 * anchor is missing a field AssemblyAI returned empty for, we omit
 * the line rather than render an empty bullet.
 *
 * The LLM is told this list is the primary signal, so the rendering
 * needs to be scannable: stable prefix per anchor, indented sub-fields,
 * clear time-range formatting.
 */
const formatAnchorChapters = (aaiChapters: AaiChapter[]): string => {
  if (aaiChapters.length === 0) return "";
  return aaiChapters
    .map((c, i) => {
      const range = `[${formatMs(c.startMs)} – ${formatMs(c.endMs)}]`;
      const lines: string[] = [`Anchor ${i + 1}: ${range}`];
      const headline = (c.headline || "").trim();
      const gist = (c.gist || "").trim();
      const summary = (c.summary || "").trim();
      if (headline) lines.push(`  Headline: ${headline}`);
      if (gist) lines.push(`  Gist:     ${gist}`);
      if (summary) lines.push(`  Summary:  ${summary}`);
      return lines.join("\n");
    })
    .join("\n\n");
};

/**
 * Build the density guidance block. This is a HINT, not a target —
 * the prompt explicitly tells the LLM to ignore the hint when the
 * content warrants a different count. The block exists so the LLM
 * has a starting density (e.g. "a 30-min talk usually has ~10
 * chapters") without being forced into a uniform-interval pattern.
 */
const buildDensityGuidance = (
  budget: ChapterBudget,
  durationSeconds: number,
): string => {
  const minutes = Math.round(durationSeconds / 60);
  const { targetMin, targetMax, target } = budget;
  return `DENSITY HINT (not a target — content wins):
- For a ${minutes}-minute video, the natural chapter density is ~${targetMin}–${targetMax} chapters (roughly ${target}). This is a HINT about typical density, not a quota.
- Match the actual number of distinct topic shifts the video contains. The AssemblyAI anchors above already reflect those shifts; trust them.
- It's fine to output FEWER chapters than the hint if many anchors cover the same topic and should be merged.
- It's fine to output MORE chapters than the hint if the content has more distinct topics than typical for this length.`;
};

/**
 * Compact millisecond formatter: 92 000 → "1:32",
 * 3 725 000 → "1:02:05". Used for anchor time ranges and the
 * prompt metadata — never persisted.
 */
const formatMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
};
