# Plan: Topic-aware highlight selection for ClipFlow's ingest pipeline

> Status: draft for review · Owner: backend pipeline · Slice target: v1.5
> Supersedes: nothing — current `video-ingest.ts` is the unimproved version

---

## 0. What we're changing, in one paragraph

Today the pipeline extracts audio + candidate frames at a fixed 1-frame-per-10-second
interval and stops at the `TRANSCRIBING` row-state — there is no consumer. We want to
finish what `docs/TechSpec.md` §4 already commits to: AssemblyAI for word-level
transcription + auto-chapters, then a structured LLM call that decides **which exact
timestamps** to pull frames from (and which chapter boundaries to publish). The same
transcript powers chapter generation and thumbnail-base-frame selection, so this slice
replaces "every 10s, blindly" with "snap to the topic beats the LLM identifies."

---

## 1. Current state (recap from reading the code)

| Stage | Today | Status enum it leaves the row in |
|---|---|---|
| `video-ingest` job | FFmpeg single-invocation: audio.mp3 (16 kHz mono MP3) + `frame_%03d.jpg` every 10 s | `EXTRACTING` → `TRANSCRIBING` |
| `transcription` consumer | **Not built.** Comment in `video-ingest.ts:23` says it's the "next slice, out of scope." | — |
| `generate` consumer (chapters + thumbnail base) | **Not built.** Spec'd in TechSpec §4, de-scoped from v1 onboarding. | — |
| `thumbnails` (Imagen) | **Not built.** | — |
| `youtube-publish` | Exists and is the actual end-state for v1 ships. | — |

`VideoStatus` enum already declares `EXTRACTING / TRANSCRIBING / GENERATING /
READY_FOR_REVIEW / FAILED` — no schema migration is needed for the new job chain.

Schema already supports: `s3KeyAudio`, `s3KeyFramesPrefix`, `frameCount`,
`durationSeconds`. **New columns needed** for the highlight + transcript artefacts
(see §6).

---

## 2. Target pipeline (5 stages)

```
upload ──► ingest ──► transcribe ──► generate (LLM) ──► review ──► publish
            │            │              │                │           │
            ▼            ▼              ▼                ▼           ▼
          MP3 +     transcript JSON  highlights[]    user picks   YouTube
          10-s grid   + autoChapters   + chapters[]   cover + OK   upload
          frames                   + thumbnails (Imagen)  │
                                                       ▼
                                                       YouTube chapters baked
                                                       into description
```

### Stage 1 — `video-ingest` (EXISTS, no behaviour change, but see §4)

Already does the audio/frame extraction. **Add at the end**: enqueue `transcribe-${id}`
instead of leaving the row at `TRANSCRIBING`.

### Stage 2 — `transcription` (NEW BullMQ queue + job)

```
INPUT:  Video row with s3KeyAudio populated
STEPS:
  1. set status = TRANSCRIBING (idempotent — re-runs are no-op)
  2. download audio.mp3 to a temp file (or stream from S3 → AssemblyAI's signed PUT)
  3. submit to AssemblyAI via their Node SDK:
       submit({
         audio: tempFile,
         language_detection: true,
         auto_chapters: true,
         speaker_labels: false,   // v1 — easy to flip on later
         word_boost: [],         // populated from user-supplied project glossary (none in v1)
       })
  4. waitUntilReady(pollingInterval=2000, pollingTimeout=15min)
  5. persist:
       • transcript JSON → S3  videos/${id}/transcript.json
       • auto-chapter list → S3  videos/${id}/chapters.auto.json
       • update Video row: transcriptS3Key, transcriptDuration, transcriptLanguage
  6. set status = GENERATING
  7. enqueue generate-${id}

FAILURE HANDLING:
  • 4xx from AssemblyAI (bad file, bad key, quota) → permanent → FAILED + failureReason
  • 5xx / timeout                        → transient → rethrow for BullMQ retry
  • pause-and-poll for >15 min           → transient (it's slow but not dead)
  • Reuse ffmpeg-errors.ts classification pattern, wrap as AssemblyAiError

COST:   ~$0.00025/sec on AssemblyAI's Universal-2.
        A 15-min podcast ≈ $0.23. Inside tier limits per TechSpec §3 "Dodo Payments".
LATENCY: 30 s – 3 min depending on audio length; mostly network + AssemblyAI compute.
```

### Stage 3 — `generate` (NEW BullMQ queue + job — THIS IS THE STAGE THE USER ASKED FOR)

```
INPUT:  Video row with transcriptS3Key set
PRE-LOAD:
  • transcript JSON from S3
  • autoChapters JSON from S3
  • video.title, video.description  (cheap context)
  • user.niche, user.primaryGoal    (preferences nudge prompt)
  • user.preferredLanguage          (future-proof for non-English videos)

PROMPT STRUCTURE (single LLM call, structured JSON output):
  System: "You are ClipFlow's video-editing co-pilot. Given a transcript with
           millisecond-precise word timings and topic auto-chapters, pick the
           best N={highlightsCount} moments for a YouTube cover thumbnail and
           the best chapter boundary set that obeys YouTube's rules
           (first timestamp = 0, min 3 chapters, min 10 s apart, max 100 chars)."
  User:   { transcript, autoChapters, title, description, niche, primaryGoal }

LLM OUTPUT JSON SCHEMA (validated server-side before persisting):
  {
    "summary": string,
    "highlights": [
      { "startMs": int, "endMs": int, "reason": string, "frameHint": string }
    ],
    "chapters": [
      { "startSec": int, "title": string }    // already obeys YouTube rules
    ]
  }

WHY A SINGLE CALL, NOT TWO:
  • One round-trip, half the cost.
  • Forces the LLM to reason jointly: a "highlight" that's also the start of a
    chapter is more clickable as a thumbnail than a random mid-chapter moment.
  • Schema validation lives in one place.

FRAME EXTRACTION (only on the LLM-picked windows):
  For each highlight, ask FFmpeg to seek to startMs and emit ONE high-quality frame
  using the existing ffmpeg wrapper (`-ss <t> -frames:v 1 -q:v 2`).
  Pick the visually strongest frame in a ±2 s window around startMs by running:
    • `sharp` to measure Laplacian variance (sharpness)
    • a small faces-count via `sharp.metadata` luminance histogram + size (no real
      face detector in v1; use brightness + contrast heuristic that biases toward
      speaking heads — frames with mid-range luma + high colour variance)
    • pick highest score
  Upload to S3: videos/${id}/highlights/frame_${idx}.jpg

IF a highlight falls on a black frame or chapter-card: re-pick next ±3 s window
up to N=3 retries; fall back to mid-window. Log every retry as a soft warning.

PERSIST + ENQUEUE:
  • update Video row: highlightsS3Prefix, highlightsCount, chaptersJson
  • set status = READY_FOR_REVIEW
  • do NOT enqueue anything else — user must confirm in the dashboard
```

### Stage 4 — review (frontend, NEW page)

Reuse the existing `<video-detail-live-progress>` + add:

- a highlight strip (5–8 thumbnail tiles) where the user picks one as the cover
- a chapters list with drag-to-edit + free-edit (existing EditableChapterList pattern)
- an "auto-pick best" button that uses the LLM's confidence field as default
- existing "Confirm & Schedule" CTA

The publish path bakes the chosen chapters into the description per YouTube's
chapter-block format (`00:00 Topic one\n01:23 Topic two\n…`) and the chosen
highlight frame either as: (a) the uploaded custom thumbnail, or (b) the base
frame for Imagen if that step runs.

### Stage 5 — `youtube-publish` (EXISTS, small extension)

- before videos.insert: forward the chosen highlight frame to `thumbnails.set` so
  the LLM-aligned frame becomes the video's actual cover (even without Imagen)
- chapters: take from Video.chaptersJson (already validated against YouTube rules
  in stage 3 — no further work needed)

---

## 3. Why the LLM picks timestamps, not the audio frames we already extract

The current 10-s grid (`videos/${id}/frames/frame_NNN.jpg`) is still useful as
**fallback / base candidates for the Imagen compositing step** (TechSpec §4 Imagen
pipeline: "score for sharpness / face presence → pick best base frame"). The new
*highlight* frames are a different, topic-driven set that lives under
`videos/${id}/highlights/`. The two sets never collide.

| Set | Purpose | Driven by |
|---|---|---|
| `frames/frame_NNN.jpg` | Base candidates for Imagen to composite with | Even 10-s grid |
| `highlights/frame_NN.jpg` | Cover thumbnail candidates + reel inputs (v2) | LLM topic picks |

If a video is short (e.g. <60 s) the LLM gets the full transcript and may pick the
single best moment. If a video is long (60 min) the LLM still gets the full
transcript but is asked for the top 6 highlights only (capped to control thumbnail
generation cost downstream).

---

## 4. Idempotency, retries, recovery

| Concern | Mitigation |
|---|---|
| Re-running `transcription` for same `videoId` | Deterministic BullMQ jobId `transcribe-${id}` dedupes. Inside the worker: if `transcriptS3Key` already set → skip. |
| Re-running `generate` | Same `generate-${id}` jobId. If `chaptersJson` already set → skip. |
| AssemblyAI rate limit (HTTP 429) | Transient → rethrow; BullMQ backoff. |
| AssemblyAI quota exceeded | Permanent → mark `FAILED` with `[AAI_QUOTA]` reason; surface in dashboard. |
| Worker crash mid-stage | BullMQ retries from the same job; idempotency checks above make that safe. |
| Worker reboot leaves orphaned `GENERATING` rows | Mirror the startup-recovery.ts two-pass pattern from `youtube-publish`: pass 1 — reconcile orphans (GENERATING → GENERATING re-enqueue if `chaptersJson` is null, else READY_FOR_REVIEW); pass 2 — re-enqueue anything still in `GENERATING` without highlight outputs. |
| AssemblyAI webhook callback (we use polling) | Don't bother; polling every 2 s is simpler than wiring a webhook receiver. |
| LLM returns invalid JSON | Validate the response against the schema; on schema failure, retry up to 2× with progressively stricter "strict JSON only" prompts; permanent fail after that with `[LLM_INVALID_OUTPUT]`. |
| LLM returns timestamps that don't exist in the transcript | Server-side validator clips to transcript range and skips; if all are out-of-range, fail permanently with `[LLM_INVALID_OUTPUT]`. |

---

## 5. Env additions (`packages/config/src/index.ts`)

```ts
ASSEMBLYAI_API_KEY: z.string().min(20),         // required when the worker runs transcription
LLM_PROVIDER: z.enum(["claude", "openai"]).default("claude"),
ANTHROPIC_API_KEY: z.string().min(20).optional(),   // required when LLM_PROVIDER=claude
OPENAI_API_KEY: z.string().min(20).optional(),     // required when LLM_PROVIDER=openai
LLM_MODEL: z.string().default("claude-3-5-haiku-latest"),
TRANSCRIBE_POLL_MS: z.coerce.number().default(2000),
TRANSCRIBE_TIMEOUT_MS: z.coerce.number().default(15 * 60_000),
```

Why `claude-3-5-haiku` / `gpt-4o-mini`: the output schema is small (~200 tokens per
video) and the reasoning required is "read transcript → pick salient segments", which
the smaller models handle well. Cost: <$0.0005 per video. Quality with structured JSON
output is comparable to larger models for this constrained schema — TechSpec §2 row
"LLM" already commits to this.

---

## 6. Schema additions (`packages/db/schema.prisma`)

```prisma
model Video {
  // ... existing fields ...
  transcriptS3Key    String?  // S3 key of the transcript JSON
  transcriptLanguage String?  // ISO 639-1 from AssemblyAI language_detection
  transcriptDurationMs Int?   // ms-precision duration (AssemblyAI returns this)
  highlightsS3Prefix String?  // S3 prefix for the LLM-picked highlight frames
  highlightsCount    Int?     // how many frames we extracted
  chaptersJson       Json?    // LLM output, already validated against YouTube rules
  // ... existing fields ...
}
```

A new table is **not** worth it — these are all per-video blobs, never queried
independently. The `Json?` column is the simplest shape and matches the spec's intent.

When image cost-shaping lands in v1.5 we should add a `VideoHighlight` table
(`videoId`, `index`, `s3Key`, `selectedByUser`) so the review screen can show the
specific S3 URLs without re-listing the prefix. Not needed for v1.

---

## 7. New worker files

```
apps/worker/src/jobs/transcription.ts            # BullMQ worker — submits+awaits AAI
apps/worker/src/jobs/generate.ts                 # BullMQ worker — LLM + frame picker
apps/worker/src/lib/transcription/assemblyai.ts  # typed AAI client wrapper
apps/worker/src/lib/llm/claude.ts                # typed Anthropic client (JSON out)
apps/worker/src/lib/llm/openai.ts                # typed OpenAI client (fallback)
apps/worker/src/lib/llm/prompts/select-highlights.ts  # the prompt template + JSON schema
apps/worker/src/lib/frame-picker.ts              # sharpness/contrast scoring in sharp
```

Plus updates to:
- `apps/worker/src/config/queue.ts` (build two new queues)
- `apps/api/src/lib/queue.ts` (`TRANSCRIPTION_QUEUE`, `GENERATE_QUEUE`, enqueue helpers)
- `apps/api/src/lib/queue.ts` `enqueueIngestJob` now chains to enqueueTranscriptionJob
- `apps/api/src/config/env.ts` recognizes new env vars
- `apps/api/src/modules/videos/videos.service.ts` — adds `getVideoDetail` returning the
  transcript + highlights + chaptersJson so the review screen can render
- `apps/web/app/dashboard/published/[id]/page.tsx` — adds ReviewSection when status =
  READY_FOR_REVIEW
- New web route `/dashboard/videos/[id]/review` (or extend the existing detail page)

---

## 8. Failure-mode checklist (run before merge)

- [ ] Audio file missing from S3 → permanent `[AAI_AUDIO_MISSING]`
- [ ] Audio is corrupt / 0-byte → permanent `[AAI_AUDIO_INVALID]`
- [ ] AssemblyAI 5xx → transient, retries with backoff
- [ ] AssemblyAI 401 (bad key) → permanent `[AAI_AUTH]`, fail boot probe
- [ ] AssemblyAI returns empty words → permanent `[AAI_EMPTY_TRANSCRIPT]`
- [ ] LLM times out (60 s) → transient, 3 retries with stricter prompt
- [ ] LLM returns non-JSON → permanent `[LLM_INVALID_OUTPUT]` after 3 attempts
- [ ] LLM returns timestamps outside transcript → permanent after validator clips
- [ ] FFmpeg seek fails (`-ss` rejects input) → permanent `[FFMPEG_SEEK_ERROR]`
- [ ] Frame picker finds no good frame after N retries → fall back to mid-window
- [ ] S3 upload fails mid-write → transient → re-run from same job

---

## 9. Out of scope / explicit non-goals

- **Reel/Shorts generation.** The same highlight-output set is the input to v2 reels,
  but the actual vertical-reframing + highlight-detection loop lives in the v2 reel
  slice. This plan only picks the moments; v2 cuts and reframes them.
- **Manual chapter override UI.** v1 lets the LLM pick chapters; users can edit them
  in the review screen but cannot re-trigger generation. If a creator wants a fresh
  set, they delete the row and re-upload.
- **Multi-language UI.** We accept whatever `language_detection` returns but don't
  show transcript text on the dashboard yet — the review screen reads English summaries.
- **Speaker diarization.** Off by default; toggleable via user preference in v1.5.
  Costs more and multi-host podcasts already work fine with single-speaker transcripts
  (chapters degrade gracefully; highlights are still topic-aligned).
- **Real-time SSE `PROGRESS` updates during AssemblyAI poll.** SSE updates fire when
  stages flip, not every 2 s during the poll — would flood the channel. Add
  incrementally only if the dashboard feels dead during the silent 30-s wait.

---

## 10. Open questions (need a decision before implementation)

1. **Highlight count cap per video?** ✅ **Locked: fixed 5.** Saves LLM tokens
   and dashboard real estate; tier caps re-enter when Imagen joins.
2. **Keep the 10-s frame grid?** ✅ **Locked: keep it as Imagen base candidates.**
   Delete in the same PR that adds Imagen (avoids a wasted re-extract pass).
3. **LLM call shape?** ✅ **Locked: single joint call** emitting highlights +
   chapters + summary. Half the cost, joint reasoning, one schema to validate.
4. **Where does the tier-based videos/month cost guard live?**
   ✅ **Locked: API enqueue layer.** Mirrors TechSpec §6 ("cost guards in API, not
   UI"). `apps/api/modules/videos/service.ts` refuses to enqueue ingestion (and
   by extension transcription) when the user is over quota.
5. **Allow user-provided glossaries (`word_boost`)?** *Defer to v1.5. Costs
   nothing today; UI surface would be a separate ship.*
6. **Spanish / Hindi / etc.** ✅ **Locked: detection on, no UI exposure in v1.**
   Caller of `videos` review screen reads `transcriptLanguage` only for
   logging — no localised content ships yet.
7. **Models.** ✅ **Locked: `claude-3-5-haiku-latest`.** OpenAI fallback behind
   env (`LLM_PROVIDER=openai` → `gpt-4o-mini`). No A/B framework in v1.

---

## 11. Order of implementation (if approved)

1. Schema additions + migration (§6)
2. Env additions + Zod schema (§5)
3. AssemblyAI client wrapper (§7) — typed, unit-tested against mock fetch
4. `transcription` job + queue wiring — end-to-end against a real 5-min audio
5. LLM client wrapper + prompt template + JSON schema validator
6. `frame-picker.ts` (sharp-based scoring)
7. `generate` job + queue wiring — end-to-end against a real 5-min video
8. Web review screen — chapter editor + highlight picker + Confirm CTA
9. `youtube-publish` extension — chapters baked into description, chosen highlight →
   thumbnails.set
10. Production rollout docs + Sentry / log alerts for the new failure codes
