# Design.md — ClipFlow (placeholder name)

## 1. Design thesis

ClipFlow's job is to be trusted to act while the creator isn't watching — it uploads, schedules, and publishes on their behalf, unattended. The product that earns this trust doesn't look flashy or "AI-magic"; it looks like a calm, legible control room. The creator should always be able to tell, at a glance, what state every video is in and whether anything needs their attention. Quiet confidence over excitement.

The one place ClipFlow is allowed to feel a little alive is the moment outputs arrive — chapters and thumbnails appearing after processing. That's the product's actual value made visible, and it's the signature moment worth a small amount of polish. Everything else (lists, status, settings, billing) should be plain, fast, and out of the way.

**One sentence to keep coming back to**: this is a publishing console, not a creative-AI playground.

## 2. Token system

### Color

A muted, low-saturation base so status colors (the thing that actually matters here) stand out clearly rather than competing with a colorful brand palette.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAFAF8` | App background, warm-neutral, not stark white |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--ink` | `#1A1B18` | Primary text |
| `--ink-muted` | `#6B6D66` | Secondary text, captions |
| `--line` | `#E4E3DC` | Borders, dividers |
| `--accent` | `#2A5C4D` | Deep pine green — primary actions, links. Deliberately not the generic SaaS blue/violet; reads as "studio," not "startup template" |
| `--status-processing` | `#9C7A2E` (amber, muted) | Processing/in-progress states |
| `--status-ready` | `#2A5C4D` (same as accent) | Ready for review — this is the state that wants attention, so it shares the accent's visual weight |
| `--status-scheduled` | `#3B5A78` (muted blue-slate) | Scheduled |
| `--status-error` | `#8C3B2E` (muted brick red, not alarm-red) | Failed/needs reauth — serious but not panic-inducing |

Dark mode: invert to `--bg: #16170F`, `--surface: #1E1F17`, keep accent and status hues but lift them one step in lightness for contrast (e.g. accent → `#4A8770`).

### Type

- **Display / UI headings**: a grotesque-leaning sans with slightly tightened tracking — e.g. `"Inter Tight"` or `"General Sans"`. Used at restrained sizes (max ~28px even for page titles) — this isn't a marketing site, headings don't need to shout.
- **Body / UI text**: same family, regular weight, for consistency and fast loading (one font family, two weights: 400 and 500 — matches the broader two-weight discipline already used in this design system).
- **Monospace** (timestamps, chapter times, video IDs, file sizes): `"JetBrains Mono"` or system mono — anywhere a number needs to be scanned precisely, monospace prevents misreading "1:05" vs "1:50" type ambiguity, which matters a lot for a chapters editor.

Scale: 12 / 13 / 14 / 16 / 20 / 28px. No size above 28px anywhere in the app — there is no hero section in a dashboard.

### Layout

- **Sidebar + content** shell, not a top-nav marketing-style layout. Left rail: Dashboard, Videos, Billing, Settings, channel-connection indicator pinned at the bottom of the rail (always visible, never buried).
- Content area is a single-column, max-width ~960px for anything text/list-based (video lists, settings) — wide multi-column dashboards read as "analytics product," which this isn't yet.
- Generous vertical rhythm (16-24px between list rows) over dense tables — creators are checking on a handful of videos at a time, not scanning thousands of rows.

### Signature element

**The status timeline strip.** Every video, in every view (dashboard row, detail page), is represented by the same small horizontal strip of 5 segments — Uploaded → Transcribing → Chapters/Thumbnails → Scheduled → Published — with the current stage filled in the relevant status color and future stages shown as empty outline segments. This is the one recurring visual motif that makes ClipFlow recognizably itself: instead of a generic "status badge" (a pill that says "Processing"), the creator always sees *where in the pipeline* a video sits, at a glance, in the same shape everywhere. It directly embodies the design thesis — legible state, always visible, never just a spinner.

```
Uploaded ●━━━○────○────○────○ Published
         (filled = done, current segment pulses subtly, future = outline)
```

This is a deliberate, justified risk: it costs a bit more design effort than a status badge, but it's the thing a returning user will recognize instantly and it reinforces "I can trust this system to show me the truth," which is the entire value proposition.

## 3. Key screens — specific guidance

### Dashboard
- Channel connection health is a persistent element in the sidebar footer, not a banner that can be dismissed and forgotten — a small dot (green/amber) next to the channel name.
- Video list uses the status timeline strip (signature element) per row, plus title, thumbnail-in-progress-or-final, and scheduled/published date.
- Empty state (no videos yet): a single clear illustration-free prompt — "Upload your first video" — resist the urge to add decorative illustration here; the thesis is restraint, not warmth-via-illustration.

### Review screen (chapters + thumbnails)
- This is the one screen allowed a moment of delight: when generation completes, chapter rows and thumbnail tiles should animate in with a brief, subtle stagger (150-200ms intervals, fade + slight upward motion) — this is the "page-load sequence" moment referenced in the design principles, used exactly once, here, because this is genuinely the payoff moment of the product.
- Chapters: editable inline list, monospace timestamps, drag handles for reorder. Validation errors (e.g. "chapters must be 10+ seconds apart") appear inline next to the offending row, in `--status-error`, not as a toast that disappears.
- Thumbnails: grid of square-ish cards at 16:9, selected state uses a 2px accent border (the one deliberate thick-border exception, consistent with "featured/selected" patterns), regenerate button shows remaining count for the tier ("3 of 5 regenerations used this video") so the limit is never a surprise.

### Schedule picker
- Plain, native-feeling date/time input — no custom calendar widget invention needed here, this is a solved UI problem and reinventing it adds risk without adding value.
- Timezone shown explicitly next to the picker (e.g. "Asia/Kolkata") — scheduling bugs from timezone confusion are a classic, avoidable trust-breaker.

### Billing
- Three plan cards (Starter/Creator/Pro), current plan clearly marked, usage shown as a simple "12 of 15 videos used this month" bar, not a chart — this is a glance-and-move-on screen, not a data screen.

### Performance panel (v1.5 — not built in v1, designed now so the layout has room for it)

The temptation with any analytics feature is to reach for a colorful, chart-heavy dashboard — that would directly contradict this product's thesis. The performance panel should look like a natural extension of the status timeline strip, not a different product bolted on.

- **Numbers over charts, by default.** Views, CTR, average view duration, subscribers gained — shown as plain stat values (matching the existing metric-card pattern: muted label above, larger number below), not as gauges or colorful donut charts. A creator checking in on a video wants the number, fast, not a visualization to interpret.
- **One sparkline, maximum, per video** — a simple line showing views accumulating over the days since publish, if a trend view earns its place at all. Resist adding more chart types just because the data exists.
- **Use `--ink-muted` and `--accent` only** — do not introduce a new "data visualization" color palette (the common trap of greens-for-good/reds-for-bad chart conventions). A video doing well isn't "green," it's just a number — let the creator interpret it, the UI shouldn't editorialize via color here, which also keeps Layer 1's "observation only, no claims" principle (see AppFlow.md Section 8) visually honest.
- **Placement**: a panel on the Video Detail page, positioned after the pipeline status and chapters/thumbnail review sections — performance is what happened *after* the product did its job, so it visually follows the rest of the page rather than competing with it for top billing.
- **Dashboard summary row**: if a trend summary appears on the main dashboard (per AppFlow.md Section 8), keep it to one line per recent video, text-first ("1.2k views, 6.4% CTR"), with the sparkline as a small secondary element, not the headline of the row.

## 4. Voice and copy

- **Active voice, plain verbs**: "Schedule video," not "Submit for scheduling." A button labeled "Publish now" produces a confirmation that says "Published," never a generic "Success."
- **Name things by what the creator controls**: "Connect your channel," not "Authorize OAuth scope." "Chapters," not "Timestamp metadata."
- **Errors state what happened and what to do, without apologizing**: "This video's publish failed because your YouTube connection expired. Reconnect to retry." Not "Oops! Something went wrong."
- **Empty states are invitations, not apologies**: "No videos yet — upload your first one to get started," not "You don't have any videos."
- Avoid AI-hype language entirely ("magic," "supercharge," "powered by AI" badges) — the product's trust comes from reliability and clarity, not from selling its own intelligence.

## 5. Motion

- Default: none, or near-none. List updates, status changes — instant, no transition needed.
- The one exception is the review-screen reveal described above.
- Respect `prefers-reduced-motion` everywhere motion is used.
- No loading spinners where a status timeline segment can instead show "in progress" — prefer the signature element's pulsing-segment treatment over generic spinners throughout the app, for consistency.

## 6. Accessibility baseline

- All status communicated by color also has a text label and/or icon — never color alone (this matters especially for the status timeline strip: filled/outline/pulsing states must also be distinguishable without color).
- Visible keyboard focus rings on all interactive elements, using the accent color.
- Responsive down to mobile for the dashboard and review screens at minimum — upload itself can be desktop-primary if needed, but a creator should be able to check status and approve a thumbnail from their phone.
