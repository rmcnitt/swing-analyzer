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
- Design: dark studio workspace, orange accent, thin chrome, video-first — see `DesignIdeas/brief.md`.

## Stack & commands
Next.js 16 App Router, React 19, TypeScript, Tailwind v4, react-konva (drawing), zod, Vitest.
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run test`
- Run lint + typecheck + test before committing.

## Code map
- `app/` thin route files; `/` hub, `/library`, `/analysis/[sessionId]` (`?compare=true` for two panes).
- `components/analysis/` workspace: `analysis-workspace.tsx` (session state), `video-pane.tsx` (playback, sync,
  zoom), `annotation-canvas.tsx` (Konva shapes), `analysis-toolbar.tsx`, `session-sidebar.tsx`, `timeline.tsx`.
- `lib/types.ts` domain types · `lib/validation.ts` zod schemas · `lib/analysis/` geometry + sync math (pure, unit-tested).
- Annotation geometry is stored **normalized 0–1** relative to the video frame; convert with `lib/analysis/annotations.ts`.

## Conventions
- Put pure logic in `lib/` with Vitest tests in `tests/`; keep components presentational where practical.
- Reuse helpers in `lib/utils.ts` / `lib/video/` instead of copying them into components.
- One commit per logical change; commit trailer per harness instructions.

## Roadmap
Phased plan (hygiene → bug fixes → compare/UX → pose estimation → ship on Vercel):
`docs/ROADMAP.md` (update it as phases complete).
