/**
 * `select-highlights` prompt — single joint LLM call that produces
 *   { summary, chapters[] }
 * for a finished transcript.
 *
 * The prompt is intentionally one call (not two) for cost and
 * consistency — when the LLM sees the transcript once, the chapter
 * boundaries and the summary naturally agree. Two sequential calls
 * (summary → chapters) would risk disagreement on the chapter
 * boundaries and double the latency.
 *
 * YouTube chapter rules baked into the prompt (validated again on the
 * server side in `validateLlmOutput`):
 *   1. First chapter must start at 0 ms.
 *   2. At least 3 chapters.
 *   3. At least 10 s (10 000 ms) between consecutive chapters.
 *   4. Each chapter title ≤ 100 chars.
 *
 * The prompt also tells the model to anchor chapters on the
 * AssemblyAI auto-chapter boundaries when they make sense. Those
 * boundaries are part of the transcript we already paid to compute,
 * and they're topic-aware (AssemblyAI's auto-chapter model is good
 * at this), so using them as anchors usually beats asking the LLM
 * to find boundaries from scratch.
 */
import type { AaiChapter } from "../../transcription/assemblyai.js";

export interface SelectHighlightsPromptInput {
  /** Full transcript text from AssemblyAI. May be long; the caller
   *  truncates to a safe input size before invoking the prompt. */
  transcriptText: string;
  /** Transcript duration in milliseconds. Used so the model doesn't
   *  propose chapters beyond the actual video length. */
  durationMs: number;
  /** Auto-chapter boundaries from AssemblyAI. Used as anchors. */
  aaiChapters: AaiChapter[];
  /** ISO 639-1 language code (e.g. "en"). Lets the model pick a
   *  matching language for the chapter titles. */
  languageCode: string;
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
  const { transcriptText, durationMs, aaiChapters, languageCode } = input;

  const durationSeconds = Math.round(durationMs / 1000);

  // ---- Anchor chapter list (AssemblyAI auto-chapters, formatted) ----
  //
  // We pass the LLM a compact, machine-friendly anchor list so it can
  // reuse boundaries that AssemblyAI already found. The model is
  // free to ignore the anchors — if its own reading of the transcript
  // suggests a better split, that's preferred.
  const anchorChapters = aaiChapters
    .map((c, i) => {
      const headline = (c.headline || c.gist || "").trim();
      if (!headline) return `${i + 1}. [${formatMs(c.startMs)}]`;
      return `${i + 1}. [${formatMs(c.startMs)}] ${headline}`;
    })
    .join("\n");

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

YOUTUBE CHAPTER RULES (your output is rejected if any of these fail):
- chapters[0].startMs MUST be exactly 0.
- chapters.length MUST be between 3 and 12.
- The minimum gap between consecutive chapter startMs values is 10 000 ms (10 seconds).
- Each chapter title MUST be ≤ 100 characters.
- Every chapter title must be in language code "${languageCode}" to match the spoken language.

ANCHOR CHAPTERS FROM ASSEMBLYAI:
The following boundaries were detected by an upstream topic-segmentation pass. They are a starting point, not a contract — override them when your reading of the transcript suggests a better split. The first anchor's startMs is already 0 only when the upstream pass found a chapter at 0; if not, prepend a chapter at startMs=0 with a fitting title.

TRANSCRIPT METADATA:
- Language: ${languageCode}
- Duration: ${durationSeconds} s (${durationMs} ms)
- Auto-chapter anchors: ${aaiChapters.length}

GUIDANCE:
- Titles should be short, descriptive, and front-loaded with the strongest noun ("Why the model hallucinates" beats "Hallucinations explained").
- Don't repeat the same noun across consecutive titles.
- The summary is what shows up in a YouTube description block, so lead with the most interesting claim.
- If the transcript is too short to support 3 chapters, return fewer; the server tolerates 1+ and re-derives YouTube-compliant chapters on the fly.`;

  const userPrompt = `AUTO-CHAPTER ANCHORS:
${anchorChapters || "(none — split from scratch)"}

TRANSCRIPT:
"""
${transcriptText}
"""`;

  return { systemPrompt, userPrompt };
};

/**
 * Compact millisecond formatter for the anchor list: 92 000 → "1:32",
 * 3 725 000 → "1:02:05". Used only inside the prompt, never persisted.
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
