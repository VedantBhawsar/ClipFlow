# PRD.md — ClipFlow (placeholder name)

## 1. Summary

ClipFlow is a SaaS platform for YouTube creators that automates three of the most repetitive parts of publishing a video: scheduling the upload, generating thumbnails, and writing chapter timestamps. A creator uploads a finished video once, and ClipFlow handles the rest — generating thumbnail options, detecting chapter breaks from the transcript, and publishing it to YouTube at a scheduled time.

Reels/Shorts generation (auto-clipping highlights into vertical video) is explicitly out of scope for v1 and is planned for v2, once the core loop is validated with real users.

## 2. Problem

Today a creator publishing a video does several manual, disconnected steps:

1. Open YouTube Studio, upload the file, wait for processing.
2. Manually pick a thumbnail frame or design one in Canva/Photoshop.
3. Re-watch the video (or rely on memory) to write chapter timestamps by hand.
4. Decide on a publish time, often just hitting "publish now" instead of scheduling strategically.
5. Repeat this for every single video, every week.

The tools that exist today solve **one piece each** — a thumbnail generator, a clip generator, a generic scheduler — and creators end up paying for and switching between 2-3 separate subscriptions ($15-30/mo each) to cover what should be one workflow. Chapters specifically are treated as a free, secondary feature by the market; nobody has made it the centerpiece, which means it's available as a meaningful "free value" component within a paid bundle rather than something to charge for directly.

There is no dominant product that owns "upload once, get scheduling + thumbnail + chapters as one pass." That gap is the opportunity.

## 3. Goals

- **Goal 1**: Let a creator upload one video and walk away — scheduling, thumbnails, and chapters are produced automatically with no further manual work beyond approving outputs.
- **Goal 2**: Be meaningfully cheaper and simpler than stitching together 2-3 separate tools.
- **Goal 3**: Validate willingness-to-pay on the core loop (scheduling + thumbnails + chapters) before investing in the harder, more expensive reels/Shorts feature.
- **Goal 4**: Keep infra/AI cost per user low enough that even the cheapest paid tier maintains healthy gross margin (target: 70%+).

## 4. Non-goals (for v1)

- Reels / Shorts auto-generation (v2).
- Multi-channel support per user account (v2) — v1 is one YouTube channel per user.
- Cross-platform publishing (TikTok, Instagram) — YouTube only.
- Team/agency accounts, seats, or collaboration features.
- Mobile app — responsive web only.
- A/B testing of thumbnails or analytics-driven optimization (just generation, not testing).
- Performance analytics (views, CTR, watch time) — deliberately deferred to v1.5, see Section 4a. Not a v1 deliverable, but the v1 OAuth consent flow should request the analytics scope alongside the upload scope now, to avoid a second re-consent prompt later (see Section 6a).
- Custom branding/style training on a creator's specific visual identity (treat all thumbnail generations as fresh per-request).

## 4a. v1.5 scope preview: performance analytics

Once the core loop (upload → schedule → thumbnails → chapters → publish) is live and validated, the first fast-follow is a **performance analytics view** — surfacing how each published video is actually doing, inside ClipFlow, so a creator doesn't have to leave the app to understand whether their upload is working. This is called out here, in v1's PRD, because it changes how a couple of v1 decisions should be made (see Section 6a) even though the feature itself ships after v1.

This is intentionally split into two layers, shipped in order:

- **Layer 1 — surfacing (the v1.5 release)**: pull YouTube's own metrics (views, impressions, click-through rate, average view duration, subscribers gained) per video and show them inside ClipFlow next to the video's pipeline status. No new analysis, no claims — just "here's how this video is doing," in one place, without a creator needing to open YouTube Studio separately.
- **Layer 2 — correlation (fast-follow after Layer 1)**: once Layer 1 has been live long enough to accumulate data, connect performance back to *our* outputs — which thumbnail variant was selected, whether chapters were used, time-of-day published — and start surfacing light insights like "videos published at 6pm IST got higher CTR" or "your last 3 thumbnails outperformed your channel average." This is the layer that turns ClipFlow from "a tool that saves time" into "a tool that makes the creator's channel grow," which is a meaningfully stronger retention and upgrade story — but it's only honest to build once there's enough real data per creator to say something true, which is why it's sequenced after Layer 1 rather than launched simultaneously.

Both layers read from the YouTube Analytics API (`yt-analytics.readonly` scope) — see TechSpec.md Section 4a for integration details. This is a second, separate OAuth scope from the `youtube.upload` scope used for publishing, and should be requested as part of the same consent flow rather than a second separate connection step, to avoid asking the creator to "connect YouTube" twice.

## 5. Target users

**Primary persona: the consistent solo creator.**
Uploads 4-15 videos a month on a single channel, doesn't have a dedicated editor or thumbnail designer, currently does everything themselves or pays for 1-2 point-solution tools. Cares about saving time more than about deep customization. Comfortable with a self-serve SaaS product, no sales calls needed.

**Explicitly not targeting in v1**: agencies/networks managing multiple creators or multiple channels, and channels with a dedicated production team (they already have these workflows solved with people, not tools).

## 6. Core user stories

1. As a creator, I connect my YouTube channel once via Google OAuth so the app can publish on my behalf.
2. As a creator, I upload a finished video file and the app stores it without me needing to also go into YouTube Studio.
3. As a creator, I see a transcript-derived set of chapter markers I can edit before they're applied.
4. As a creator, I see 3-10 AI-generated thumbnail options (tier-dependent) and pick one, or regenerate.
5. As a creator, I set a publish date/time and the video goes live on YouTube automatically at that time, with my chosen thumbnail and chapters already applied.
6. As a creator, I can see the status of each video (processing, ready for review, scheduled, published, failed) at a glance.
7. As a creator, I subscribe to a paid plan via Dodo Payments and my usage limits (videos/month) update accordingly.
8. As a creator, if my YouTube connection is revoked or expires, I'm clearly prompted to reconnect before my next scheduled publish fails silently.

## 6a. Decision: request the analytics OAuth scope in v1, even though the feature ships in v1.5

Asking a creator to re-grant a new Google permission a few weeks after they've already connected their channel is a worse experience than asking once, even for a scope that won't be used yet. v1's OAuth consent screen should request `youtube.upload` + `youtube.readonly` + `yt-analytics.readonly` together at initial connection time, and the analytics scope simply goes unused until v1.5 ships. This has no cost or complexity implication for v1 engineering beyond adding one scope string to the OAuth request — it's purely a sequencing decision, captured here so it isn't missed when v1's auth flow is implemented.

## 7. Feature scope (v1)

| Feature | In scope for v1 | Notes |
|---|---|---|
| Google OAuth + YouTube channel connect | Yes | `youtube.upload` scope |
| Video upload to storage | Yes | Direct to S3, resumable if possible |
| Scheduled publish via YouTube Data API v3 | Yes | Uses `status.publishAt` |
| Transcript generation | Yes | AssemblyAI |
| Chapter generation (timestamps + titles) | Yes | LLM over transcript, user-editable before applying |
| Thumbnail generation | Yes | Frame extraction (FFmpeg) + Google Imagen-generated background/composite, tier-limited count |
| Billing / subscriptions | Yes | Dodo Payments |
| Usage limits enforcement (videos/month by tier) | Yes | |
| Performance analytics (views, CTR, watch time) | No (v1.5) | OAuth scope requested in v1 (see Section 6a), feature itself ships v1.5 — see Section 4a |
| Reels / Shorts generation | No (v2) | |
| Multi-channel | No (v2) | |
| Team accounts | No | Not currently planned |
| Cross-platform publishing | No | Not currently planned |

## 8. Pricing tiers (reference — see business model, not a spec for engineering)

| Tier | Price | Videos/mo | Thumbnails/video |
|---|---|---|---|
| Starter | $15/mo | 5 | 3 |
| Creator | $35/mo | 15 | 5 |
| Pro | $69/mo | 40 | 10 |

Chapters are included, unlimited per video, on every paid tier — not metered separately. A free tier (1 video/month, watermarked thumbnail) is recommended for acquisition but is a business decision, not committed in this PRD; flag to confirm before billing implementation.

## 9. Success metrics

- **Activation**: % of signups who connect a YouTube channel and complete one full video cycle (upload → review → scheduled/published) within 7 days.
- **Retention**: % of users still active (≥1 video processed) in month 2.
- **Conversion**: free-to-paid conversion rate, if a free tier ships.
- **Cost discipline**: actual AI/infra cost per active user stays under ~20% of that user's plan price (target 70-80% gross margin, per the cost modeling done earlier).
- **Reliability**: % of scheduled publishes that succeed on time without manual intervention (target >98%).
- **(v1.5, forward-looking)**: % of users who view their analytics dashboard at least weekly, once Layer 1 ships — a proxy for whether the feature is actually pulling people back into the app between upload cycles.

## 10. Key risks

1. **YouTube API quota** — default quota (10,000 units/day, ~6 uploads/day) blocks any real usage beyond a handful of testers. A quota increase request must be filed in week 1; this is a hard external dependency with a 1-4 week Google review timeline, and is the single biggest schedule risk in this PRD.
2. **OAuth token health** — refresh tokens can be revoked or expire from inactivity; a stale connection causing a silent failed scheduled publish is a severe trust-breaking bug. The product must surface reconnect prompts proactively (see AppFlow.md).
3. **Thumbnail quality perception** — purely AI-generated faces/subjects tend to look synthetic and creators often reject them outright. v1 mitigates this via frame-extraction (real footage) composited with AI-generated backgrounds/text rather than fully synthetic creator likenesses.
4. **Cost variance** — transcription and image generation costs scale directly with usage; a small number of power users uploading unusually long videos could erode margin on lower tiers. Usage limits (videos/month, not just count but reasonable duration assumptions) should be monitored after launch.

## 11. Open questions to confirm before/soon after build

- Will there be a free tier at launch, or paid-only from day one? (Recommended: free tier for acquisition, but this is a business call.)
- What's the maximum video length/file size supported in v1? (Needs a hard limit for cost predictability — suggest capping at 60 minutes / 5GB for v1 and revisiting.)
- Refund/cancellation policy with Dodo Payments — proration behavior on downgrade.
