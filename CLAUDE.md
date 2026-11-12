# Swing Analyzer

Golf swing video review web app (modeled on V1 Golf / SwingCatalyst): import swings, slow-mo/frame-step,
draw on video, mark swing positions, compare two swings side by side. Personal tool + resume project.

## Product constraints (decided; don't re-litigate)
- **Client-only, no accounts/backend.** A visitor opens the link and uploads a video immediately. Videos and
  sessions live in IndexedDB (`lib/storage/session-storage.ts`). Don't add auth, servers, or paid services.
- **No tour-pro footage ships** (copyright). Users import their own reference clips. `public/pro-swings/` media
  and `DesignIdeas/*.png` (V1 screenshots) are gitignored, local only.
- **Compare = side-by-side panes matched by swing position** (Address/Top/Impact checkpoints). Never overlay/onion-skin.
- Targets desktop + iPad (touch drawing); phone must work but can be simplified.
- Design: **read `DESIGN.md` before any UI work** (tokens, components, screens, banned patterns, verification).
  Dark studio, one orange accent, thin chrome, video-first. Working features always outrank visuals.

## Stack & commands
Next.js 16 App Router, React 19, TypeScript, Tailwind v4, react-konva (drawing), zod, Vitest.
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run test`
- Run lint + typecheck + test before committing.

## Code map
- `app/` thin route files; `/` hub, `/library`, `/analysis/[sessionId]` (`?compare=true` for two panes).
- `components/analysis/` workspace: `analysis-workspace.tsx` (session state), `video-pane.tsx` (playback, sync,
  zoom), `annotation-canvas.tsx` (Konva shapes), `analysis-toolbar.tsx`, `notes-popover.tsx`, `timeline.tsx`.
  `position-bar.tsx` (marker row: positions + custom markers, edit mode) / `compare-position-bar.tsx` (jump both), `golfer-box-editor.tsx` (fit framing).
- `lib/types.ts` domain types · `lib/validation.ts` zod schemas · `lib/analysis/` pure, unit-tested logic:
  `sync.ts` (checkpoint time mapping) + `sync-group.ts` (pane playback/looping), `positions.ts`, `shape-edit.ts`,
  `framing.ts`, `loop.ts`, `shortcuts.ts` (key map), `annotations.ts` (normalized geometry), `frames.ts` (fps/stepping),
  `workspace-layout.ts` (desktop / phone / compact, when phone compare turns sideways) + `screen-rotation.ts`
  (maps pointers back into the rotated layout; `konva-rotation.ts` does the same for the canvas).
- `lib/pose/` pose estimation: `pose-engine.ts` (MediaPipe, lazy), `pose-cache.ts` (own IndexedDB db),
  `pose-store.ts` (per-clip status/tracks), `landmarks.ts` (packed track format), `clean-track.ts`,
  `swing-positions.ts` (Address/Top/Impact/Finish from the hand path), `golfer-box.ts`, `auto-positions.ts`,
  `swing-check.ts` (tempo, head, posture, early extension, lead arm; `CHECK_TOLERANCES`; golfer-height ruler) +
  `draw-checks.ts` (overlays, shared with PNG export); UI in `pose-overlay.tsx`, `swing-check.tsx` (checks panel).
  Detection is tested on recorded sample tracks in `tests/fixtures/pose/`.
- Annotation geometry is stored **normalized 0–1** relative to the video frame; convert with `lib/analysis/annotations.ts`.

## Conventions
- Put pure logic in `lib/` with Vitest tests in `tests/`; keep components presentational where practical.
- Reuse helpers in `lib/utils.ts` / `lib/video/` instead of copying them into components.
- One commit per logical change; commit trailer per harness instructions.

## Roadmap
Phased plan (hygiene → bug fixes → compare/UX → pose estimation → ship on Vercel):
`docs/ROADMAP.md` (update it as phases complete).
