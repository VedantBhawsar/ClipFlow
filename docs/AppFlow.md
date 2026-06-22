# AppFlow.md — ClipFlow (placeholder name)

This document describes the user-facing flow end to end: every screen a user passes through and the system events triggered at each step. It's the bridge between PRD.md (what/why) and TechSpec.md (how) — written so frontend and backend work can be split along these flow boundaries.

## 1. Onboarding flow

```
1. Landing page → Sign up (email/password, with "Continue with Google" as
   an alternative — both create the same User record shape; Google sign-in
   here only ever requests openid/email/profile, never youtube.upload)
2. App login created → redirected to a short profile step (NOT the
   dashboard yet):
     a. Channel/display name
     b. Content niche (Gaming / Tech & Education / Vlog & Lifestyle /
        Business & Finance / Entertainment & Comedy / Other)
     c. Upload frequency (1-4 / 5-10 / 11-20 / 20+ per month)
     d. Primary goal (Save time editing / Better thumbnails & CTR /
        Consistent posting schedule / Grow views)
   All four are quick single-select taps, no free text required — this
   is the "medium" depth tier: more than name-only, well short of a survey.
3. On submit, UserProfile is created, onboardingCompletedAt is set,
   and a recommendedPlanId is computed from the upload-frequency answer
   (surfaced later, on the billing screen — not shown or charged here)
4. Redirected to Dashboard (empty state)
5. Dashboard shows "Connect your YouTube channel" prompt (blocking — no
   upload possible yet)
6. User clicks Connect → Google OAuth consent screen (youtube.upload + youtube.readonly + yt-analytics.readonly scopes — the analytics scope is requested now even though the analytics feature itself ships in v1.5, to avoid a second re-consent prompt later)
7. On consent → redirect back to app → backend exchanges code for tokens,
   stores encrypted refresh token, fetches channel name/thumbnail for display
8. Dashboard now shows connected channel name + "Upload your first video" CTA
```

**System events**: account created → profile step submitted → `UserProfile` row created/completed → `youtube-channel` connection record created with status `connected` (once Step 6-7 completes) → channel metadata cached (name, avatar, channel ID) for display without repeated API calls.

**Build-order note**: per the agreed implementation sequencing, Steps 1-5 (auth, profile questions, dashboard shell) are built and fully functional before Step 6 (the actual YouTube OAuth wiring) exists. The "Connect your YouTube channel" button in Step 5 should exist as real, clickable UI from the start — it just doesn't do anything until the YouTube OAuth configuration step of the build is reached. This keeps the dashboard's session/state model honest the whole time: "logged in" and "profile complete" are real states from day one, "channel connected" stays falsy until that piece is wired in, and nothing needs to be restructured when it is.

**Edge case to design for**: user denies consent or closes the OAuth popup — dashboard should clearly show "not connected" rather than a broken/stuck state, with a retry button.

**Edge case to design for (profile step)**: a user who abandons onboarding mid-profile-step (closes the tab after signup but before finishing the four questions) should land back on the profile step on next login, not the dashboard — check `onboardingCompletedAt` on login, not just whether a `User` row exists.

## 2. Upload flow

```
1. Dashboard → "Upload video" button
2. File picker (client-side validation: file size ≤5GB, duration check after
   selection if feasible client-side, otherwise validated post-upload)
3. Frontend requests a pre-signed S3 upload URL from the API
4. Direct browser → S3 upload, with progress bar
5. On upload complete, frontend notifies API → Video record created with
   status `uploaded`, job enqueued to `video-ingest` queue
6. User is redirected to the Video Detail screen, status shown as "Processing"
```

**System events**: `Video` row created (`status: uploaded`) → `video-ingest` job enqueued → worker picks up job, runs FFmpeg (extract audio + candidate frames) → on success, enqueues `transcription` job → status updates to `transcribing`.

**Usage limit check**: before step 5 commits, the API checks the user's current month's video count against their plan's `videos_per_month` limit. If exceeded, the upload is rejected with a clear message and an upgrade prompt — this check happens server-side, not just hidden/disabled in the UI.

## 3. Processing flow (system-driven, minimal user interaction)

```
video-ingest (FFmpeg: audio + frame extraction)
        │
        ▼
transcription (AssemblyAI: full transcript + word-level timestamps)
        │
        ├──────────────┐
        ▼              ▼
   chapters job    thumbnails job
   (LLM over        (Imagen generation +
    transcript)      frame compositing)
        │              │
        └──────┬───────┘
               ▼
   status: "ready_for_review"
```

Chapters and thumbnails run in parallel once the transcript exists — they don't depend on each other. The video's status moves to `ready_for_review` only once both finish.

**Failure handling**: if any single job fails (e.g. AssemblyAI timeout, Imagen rate limit), retry with backoff (BullMQ built-in). After exhausting retries, mark that specific sub-task as `failed` but don't block the rest of the pipeline — e.g. if thumbnails fail but chapters succeed, the user should still be able to review chapters and manually upload/pick a thumbnail rather than the whole video getting stuck.

## 4. Review flow

```
1. User opens Video Detail screen, status: "Ready for review"
2. Two review panels:
   a. Chapters panel — list of generated timestamp + title pairs,
      each editable inline, with ability to add/remove/reorder
   b. Thumbnails panel — grid of generated options (3/5/10 depending
      on tier), user selects one or clicks "Regenerate" (consumes
      from the same tier-limited pool — regenerating doesn't grant
      extra beyond the plan cap)
3. User clicks "Approve & Schedule"
```

**Validation before allowing approval**: chapters must satisfy YouTube's rules (first timestamp = 0:00, minimum 3 chapters, minimum 10 seconds apart) — if the user's edits violate this, show inline validation errors rather than allowing an invalid submission.

## 5. Scheduling flow

```
1. After "Approve & Schedule" → Schedule picker screen
2. User selects publish date + time (timezone-aware, default to
   the user's local timezone)
3. User confirms title/description (pre-filled, editable — chapters
   get appended to the description in YouTube's required format)
4. Confirm → Video status becomes "scheduled"
5. At the scheduled time, `youtube-publish` job runs:
   - If video bytes not yet on YouTube's servers, uploads now
     with privacyStatus=private and publishAt=<timestamp>
   - If already uploaded in private state, updates metadata
     (thumbnail, description with chapters) and confirms publishAt
6. On success, status becomes "published"; on failure (e.g. token
   expired, quota exhausted), status becomes "publish_failed" and
   the user is notified (email + in-app banner) with a clear next
   step (reconnect channel / retry)
```

**Design decision to confirm with engineering**: whether the actual YouTube upload happens at upload time (private, scheduled) or is deferred until close to the scheduled publish time. Uploading early is safer against quota exhaustion at the last minute but uses YouTube storage/processing earlier. Recommend uploading as soon as review is approved (not waiting until publish time), since `publishAt` lets YouTube handle the actual go-live timing — this also surfaces upload-time failures (quota, auth) earlier, when the user has more runway to fix them before their intended publish time.

## 6. Reconnection flow (channel health)

```
Triggered when: a youtube-publish job fails with an auth error
   (invalid_grant / token revoked), OR a scheduled background check
   detects the refresh token is no longer valid.

1. Channel connection status flips to "needs_reauth"
2. Dashboard shows a persistent, non-dismissible banner:
   "Your YouTube connection needs to be renewed" + Reconnect button
3. Any videos with status "scheduled" that depend on this channel
   show a visible warning on their Video Detail page too
4. Reconnect → same OAuth flow as initial onboarding (Section 1,
   steps 4-6) → on success, status returns to "connected" and any
   pending publish jobs are retried
```

This flow exists specifically because a silent failed scheduled publish (a video that was supposed to go live and didn't, with no warning) is one of the most trust-damaging failure modes for this product — it must be surfaced proactively, not discovered by the user checking YouTube manually.

## 7. Billing flow

```
1. User on free/no plan (or below desired tier) hits a limit
   (upload blocked, or visits Pricing page directly)
2. Pricing page → selects a tier → redirected to Dodo Payments
   hosted checkout
3. On successful payment, Dodo webhook (`subscription.active`)
   fires → backend updates the user's plan + resets/sets their
   videos_per_month allowance
4. User redirected back to app, dashboard reflects new plan limits
   immediately (don't make the user wait for a page refresh or
   polling delay beyond a few seconds)
```

**Downgrade/cancellation**: handled via Dodo's customer portal (if available) or an in-app "Manage subscription" link that redirects there. On `subscription.canceled` webhook, the user's access should degrade gracefully at the end of their current billing period, not instantly — avoid surprising a user mid-cycle.

**Failed payment**: on `subscription.on_hold` webhook, show an in-app banner prompting payment method update; don't immediately lock out existing scheduled videos that are already in the pipeline, but block new uploads until resolved.

## 8. Analytics flow (v1.5 — not built in v1)

This section describes the flow for the v1.5 fast-follow (see PRD.md Section 4a). It's included here now so the dashboard and video-detail screens in v1 can be laid out with this in mind — e.g. leaving a natural slot on the Video Detail page rather than needing a redesign later.

```
1. Some time after a video's status becomes "published" (not
   immediately — YouTube's own analytics take time to populate),
   a scheduled `analytics-sync` job pulls stats for that video
   from the YouTube Analytics API and stores them in a cached
   VideoStats record (see Schema.md)
2. On the Video Detail page, a "Performance" panel appears
   alongside the existing pipeline status — views, CTR, average
   view duration, subscribers gained
3. On the Dashboard, a lightweight summary row/sparkline can show
   recent performance trend across the last few published videos,
   without requiring a click-through (this satisfies the "glance
   and understand" pattern established elsewhere in the app)
4. Data refreshes on a schedule (e.g. daily), not on-demand per
   page load — page load reads from the cached VideoStats table,
   never calls the YouTube Analytics API directly, to respect the
   quota-sharing constraints noted in TechSpec.md
```

**What this flow deliberately does NOT do in Layer 1**: no recommendations, no "you should post at this time" insights, no comparisons framed as advice. Layer 1 is observation only — "here's what happened" — because making causal claims ("this thumbnail worked because...") with limited data risks being wrong and damaging trust, which is exactly the trust this product has been designed to build elsewhere (see the reconnection flow's design rationale in Section 6). Layer 2, once there's enough data, is where lightweight pattern-surfacing gets introduced — and even then, framed as observations a creator can take or leave, not directives.

## 9. Dashboard (home screen) — states summary

The dashboard is the hub a returning user lands on. It should make these states immediately scannable without clicking into each video:

| Video status | What the user sees |
|---|---|
| `uploaded` / `transcribing` / processing states | "Processing..." with a subtle progress indicator |
| `ready_for_review` | Highlighted/actionable — "Needs your review" |
| `scheduled` | Shows scheduled date/time |
| `published` | Link to the live YouTube video |
| `publish_failed` | Clearly flagged, with the reason and a fix action |

Channel connection health (connected / needs_reauth) should be visible from the dashboard at all times, not buried in settings.
