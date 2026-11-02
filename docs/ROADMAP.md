# Swing Analyzer — Refinement Roadmap

## Context
Project migrated from Codex to Claude Code. It's a Next.js 16 / React 19 / TS / Tailwind v4 / react-konva MVP
(modeled on SwingCatalyst + V1 Golf): import swings, review with drawing tools, slow-mo/frame stepping,
markers, and side-by-side compare. Persistence is browser-only (IndexedDB + localStorage).

Goal: a polished, publicly deployed personal tool + resume project. A hiring manager should open the link,
upload a video (or try a bundled sample) and use it immediately — no accounts.

Decisions (2026-11-02):
- **Local-only, no auth.** Remove the unused Supabase scaffolding. Static/edge deploy on Vercel, zero backend cost.
- **Bring-your-own references.** No tour-pro footage ships. Users import their own reference clips; the user's pro clips stay local (gitignored).
- **Pose-estimation AI feature** after core polish.
- **Desktop + iPad/tablet** first; phone gets a simplified-but-working view.

Baseline health: lint clean, 8/8 vitest pass, `tsc --noEmit` 1 error (tests/annotation-serialization.test.ts:31). Not a git repo. Located in iCloud-synced ~/Documents (causes `file 2.json` dupes in `.next/`).

---

## Phase 0 — Foundation & hygiene  _(done 2026-11-02)_
1. Move project out of iCloud-synced `~/Documents` (suggest `~/dev/swing-analyzer`; user does the move), delete `.next/`, `git init`, first commit, push to a new GitHub repo.
2. Remove Supabase: `lib/supabase/`, `supabase/migrations/`, `@supabase/*` deps, `.env.example`/`.env.local`, README section. Remove redirect stubs `app/login`, `app/dashboard` (keep `app/compare/[id]` redirect only if linked anywhere — it isn't after Phase 1, so remove).
3. Media: gitignore `public/pro-swings/*` video files; delete 9KB placeholder mp4s. Remove the pro-swings generator from `dev`/`build` scripts (and `pro-swings.generated.ts`, `pro-swing-overrides.ts`) once references are user-imported (Phase 1).
4. Sample content: replace `lib/mock-data.ts` (flower.mp4 / Big Buck Bunny) with 1–2 short, compressed clips of the user's own swing in `public/samples/` (H.264 mp4, <5MB each) + one seeded demo session with a few markers/drawings so first-time visitors see a populated workspace.
5. Dead code / dedupe:
   - Delete `components/dashboard/session-card.tsx`, `video-card.tsx`, `mockProSwings`, `ProSwing` type.
   - `readVideoMetadata` + `createVideoThumbnail` (copies in `components/dashboard/swing-hub.tsx`, `components/analysis/analysis-workspace.tsx`) → `lib/video/media.ts`.
   - `uniqueVideos`/`uniqueSessions` (3 copies) → `lib/utils.ts`.
   - `SyncSignal`/`PlaybackSignal`/`MarkerSeekSignal` (duplicated in workspace + video-pane) → `lib/types.ts`.
   - Simplify `lib/data/repository.ts` to a thin seed-data module (no fake async server repo).
6. Fix tsc error; add `"typecheck": "tsc --noEmit"`; GitHub Actions CI running lint + typecheck + test + build.

## Phase 1 — Correctness bugs
- **Silent session loss:** clamp normalized geometry at creation (`lib/analysis/annotations.ts`), relax circle radius bound in `lib/validation.ts`, and on parse failure drop only invalid annotations rather than the whole session (`lib/storage/session-storage.ts`).
- **References model:** add `sourceType: "reference"` (replacing "pro"); import flow gets a "Save as reference" toggle; Library tabs become My swings / References; compare-pane picker groups both. "Add to compare" passes `?compare=true&ref=<videoId>` and the workspace loads it into the secondary pane (fixes current bug where the chosen pro is ignored).
- **Hydration:** stop reading localStorage in `useState` initializers (analysis-workspace.tsx:128, library-browser.tsx:33).
- **Object URL leaks:** revoke URLs from `loadStoredVideos` on unmount/replacement.
- **Drawing input:** Konva pointer events (touch/pen), ignore zero-length shapes, map pointer through the zoom/pan transform so drawing works while zoomed.
- **Frame accuracy:** detect real fps via `requestVideoFrameCallback` on import (fallback to user-set fps); step by true frame duration.
- **Playback loop:** drive time display/scrubber from rVFC + refs; keep per-tick `currentTime` out of persisted session state (stops full re-render + autosave churn); replace seek-chasing sync with leader-driven lockstep.
- **Unplayable video:** catch decode errors (e.g. HEVC .mov in Chrome) and show a clear message with guidance.
- **Delete / rename** sessions and videos from Hub and Library (IndexedDB blobs included); show storage usage via `navigator.storage.estimate()` and request persistence (`navigator.storage.persist()`).

## Phase 2 — Core analysis UX (V1 / SwingCatalyst parity)
- Keyboard shortcuts: Space play/pause, ←/→ frame, Shift+←/→ 10 frames, 1–5 speeds, tool hotkeys, ⌘Z/⇧⌘Z, Delete; `?` overlay listing them.
- **Position-matched side-by-side compare** (the core comparison feature; panes stay side by side, never overlaid):
  - Each pane gets swing-position checkpoints (Address, Takeaway, Top, Transition, Impact, Finish; reuses the existing marker labels in `session-sidebar.tsx`).
  - "Jump both to position" buttons (e.g. Top) seek both panes to that position at once, so the user can study the same moment in each swing.
  - Matched playback and stepping: between shared checkpoints the follower pane's time is mapped piecewise-linearly onto the leader's, so the two swings stay aligned at every position even when tempos differ (a 1.0s backswing compared with a 0.8s one). With only one shared checkpoint it falls back to a simple offset.
  - Matched framing: per-pane zoom/pan (already exists) plus a "fit golfer" preset, so both golfers appear about the same size and position in their pane.
  - Unit-test the mapping math in `lib/analysis/sync.ts` (offset, piecewise mapping, clamping at clip edges).
- Edit shapes: select/move/resize (Konva Transformer + draggable endpoints), stroke width, label text, extended-line tool (plane line).
- Loop range (in/out points) on the timeline.
- Export current frame + drawings as PNG (both panes in compare).
- Responsive: side-by-side compare on tablet landscape, top/bottom on portrait; inspector becomes a slide-over drawer below xl; toolbar adapts to touch targets.

## Phase 3 — Pose-estimation feature
- In-browser MediaPipe Pose Landmarker (WASM, lazy-loaded only when toggled), run per-frame on demand / cached per video in IndexedDB.
- Skeleton overlay toggle; live joint angles (spine tilt, lead-arm, knee flex).
- Auto-detect key positions (address, top, impact) from wrist/hand trajectory → auto-create the position checkpoints that drive position-matched compare (Phase 2), so two swings line up with no manual marking.
- Small chart of a tracked angle over time (hip/shoulder rotation proxy).

## Phase 4 — Ship it
- Landing/first-run: hub explains in one line, "Try the sample swing" + "Upload your swing" CTAs; privacy note ("videos never leave your browser").
- Deploy to Vercel (+ optional custom domain), OG image/metadata, favicon.
- Playwright e2e smoke: load sample → draw → compare → reload persists; upload fixture video.
- Accessibility pass (focus states, aria labels, contrast), Lighthouse check.
- README rewrite: demo GIF, feature list, architecture diagram (client-only, IndexedDB, Konva overlay, normalized coordinates), tech decisions, running locally.

## Verification
- Every phase: `npm run lint && npm run typecheck && npm run test && npm run build` (and CI green on push).
- Manual in `npm run dev`: import a swing; draw every tool at 100% and zoomed; touch-emulate in Chrome devtools (iPad); mark Address/Top/Impact in two clips with different tempos and confirm both panes land on the same position when jumping and stepping; reload to confirm persistence; delete a session and confirm blobs removed.
- New unit tests for pure logic (geometry clamping, sync offset, fps detection helpers, session salvage); Playwright smoke in Phase 4.

## Working approach
Execute phase by phase, one commit per logical change, pausing after each phase for the user to review in the browser.
