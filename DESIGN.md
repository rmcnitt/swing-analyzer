# DESIGN.md — Swing Analyzer

Read this before any UI work. If a request conflicts with this file, ask before deviating.
Precedence: product constraints in `CLAUDE.md` (client-only, no tour footage, compare = side-by-side panes
matched by swing position) win over this file. This file replaces `DesignIdeas/brief.md` wherever they differ.
Working features come before visuals: polish never removes or breaks a feature.

## Direction
A precise instrument for reviewing your swing. Dark studio. The video is the hero; the UI recedes until needed.
Feel: professional swing analysis tools (SwingCatalyst, Sportsbox AI), pro video tools (DaVinci Resolve viewer), Teenage Engineering product pages, Linear's density and restraint.
Not: a SaaS dashboard, a fitness app, or a marketing template.

## Principles
1. Video first. Chrome around the video stays thin, quiet and low-contrast.
2. One accent. Orange marks only what is active, selected, or the primary action.
3. Show data as data. Numbers are monospace, tabular, with small muted units.
4. Fewer, better elements. Remove before adding. No decoration without a job.
5. Consistent everywhere. Every value comes from the tokens below. No one-off colors, sizes or radii.

## Tokens
Define as CSS variables in `app/globals.css` and map them into the Tailwind theme (`@theme inline`). Replace every hard-coded value.
Canvas drawing (`lib/pose/draw-checks.ts`, Konva annotations, PNG export) can't read CSS variables: keep the same
values in one shared TS constants module and import them; don't scatter hex codes.

### Color
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0B0C` | App background, behind video |
| `--surface-1` | `#131315` | Panels, sidebars, toolbars |
| `--surface-2` | `#1A1A1D` | Raised: menus, popovers, hovered rows |
| `--border` | `#26262A` | 1px dividers and outlines |
| `--border-strong` | `#3A3A40` | Focused inputs, active outlines |
| `--text` | `#EDEDEF` | Primary text |
| `--text-muted` | `#9A9AA2` | Secondary text, labels |
| `--text-faint` | `#5E5E66` | Units, hints, disabled |
| `--accent` | `#FF6A1A` | Active/selected state, primary button, playhead |
| `--accent-dim` | `#FF6A1A26` | Accent backgrounds (15% alpha) |
| `--good` | `#5BBF7A` | Metric in range |
| `--warn` | `#E0B04A` | Metric worth checking (past its `CHECK_TOLERANCES` limit) |
| `--bad` | `#E0605A` | Errors only (failed import, pose analysis failed), never a metric |

**Pose overlays** (skeleton + swing-check drawings, on screen and in PNG export):
- Skeleton: joints and limbs in `--text` at 70% opacity with a 1px `--bg` outline.
- Check overlays: reference marks (Address head ring, Address "wall" line) dashed in `--text-muted`; live marks
  (current head ring, butt dot, lines) in `--accent`; a live mark past its tolerance turns `--warn`.
- On-video labels: mono, `--text` on a `--bg` 70% scrim pill. No per-check rainbow colors; a check is identified by its label.

**User annotations** (drawing tools) are the exception: they keep a small user-picked swatch palette, since
golfers need contrasting colors on varied footage. Default swatch is `--accent`.

### Type
- UI: IBM Plex Sans (via `next/font/google`, replacing Manrope), weights 400 / 500 / 600 only.
- Data: IBM Plex Mono, `font-variant-numeric: tabular-nums`.
- Scale (px / line-height): 11/16 label-caps · 13/20 body-sm (default UI) · 15/22 body · 18/26 h3 · 24/30 h2 · 40/44 h1 · 64/64 display (landing only).
- Labels: 11px, uppercase, `letter-spacing: 0.06em`, `--text-muted`.
- Units next to numbers: 0.8× size, `--text-faint`. Example: `1.1` `in`, `3.1` `: 1`, `56` `°`.

### Spacing, shape, depth
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Nothing else.
- Radius: 6px for controls, 10px for panels and cards, 0 for the video frame.
- Borders over shadows. Shadows only on floating menus and the floating checks panel: `0 8px 24px rgba(0,0,0,.4)`.
- Control height: 28px (toolbar), 36px (buttons, inputs). Touch targets ≥ 44px on iPad (coarse pointer): grow the hit area, not the icon.

### Icons
One set only (Lucide), 1.5px stroke, 16px in toolbars, 20px elsewhere. `--text-muted` by default, `--text` on hover, `--accent` when active.
Every icon-only button has an `aria-label` and a tooltip with its shortcut (from `lib/analysis/shortcuts.ts`).

### Motion
- 120ms ease-out for hover/press; 200ms ease-out for panels and menus.
- No bouncing, no parallax, no scroll-triggered animation. Respect `prefers-reduced-motion`.
- Never animate anything tied to playback (playhead, overlays): they track the video frame exactly.

## Components
- **Buttons:** primary = `--accent` bg, `#0B0B0C` text. Secondary = transparent, 1px `--border`, `--text`. Ghost = text only. One primary per view.
- **Position chips** (Address / Top / Impact / Finish): 28px tall, mono label. Unmarked = `--text-faint` outline; marked = `--text`; current = `--accent` outline + `--accent-dim` fill. Auto-detected and hand-marked look the same.
- **Swing checks panel** (per pane, Gauge button): a compact floating table that snaps to any corner of the pane and
  remembers it. Rows = checks (Tempo, Head, Posture, Early extension, Lead arm), each with its own switch.
  Columns = Address / Top / Impact, whose headers double as jump buttons. Cells = value (mono) + unit + status dot
  (`--good` or `--warn`). A switched-off check shows no numbers and draws nothing; with every check off, nothing is
  drawn. Face-on clips fold the down-the-line-only checks into one muted note. Golfer height sits in the panel footer.
  Styled as a panel (`--surface-1`, 1px `--border`, 10px radius) with the floating shadow.
- **Panels:** `--surface-1`, 1px `--border`, 16px padding, label-caps heading.
- **Timeline:** 2px track in `--border`, played portion `--text-muted`, playhead and loop handles `--accent`, position markers as small ticks.
- **Empty states:** one line of text, one action. No illustrations.
- **Loading (pose analysis):** a thin scan line moving down the video frame plus `Analyzing frame 84 / 150` in mono
  (frames from duration × fps; fall back to a mono percentage when unknown). Analysis stays cancellable. No spinners.
- **Focus:** 2px `--accent` outline, 2px offset, on every interactive element (`:focus-visible`).

## Screens
- **Landing (`/`):** a looping clip of the user's own sample swing (`public/samples/`, never tour footage) shown
  inside the real workspace UI, with the skeleton and check overlays drawing on. One headline, one sentence, two
  buttons: `Try the sample swing` (primary, opens a seeded demo session), `Upload your swing` (secondary). One
  privacy line: "Videos never leave your device." Below the fold: at most three real screenshots with one-line
  captions. Footer with GitHub link.
- **Library:** grid of video thumbnails (16:9 or 9:16 as filmed), title, date, view tag (Face-on / DTL) in mono, shown only once the view is detected. Sections: My swings, References. Storage used shown as a thin bar in the header (`navigator.storage.estimate()`).
- **Workspace:** video centered on `--bg`. Thin top bar (back, title, sync/compare, export). Tools vertical on the left. Position chips + timeline at the bottom. Nothing overlaps the golfer by default (checks panel starts in a corner; the user can move it).
- **Compare:** two side-by-side panes with identical chrome, matched by swing position, never overlaid. Each pane
  keeps its own timeline (clips differ in tempo); one shared transport and the shared position bar jump both panes
  to the same checkpoint. _Later:_ metric deltas between the two checks panels.
- **Phone:** playback, positions and the checks panel only. Drawing tools hidden. Compare stacks vertically.

## Copy
- Plain and specific. Sentence case. No exclamation marks.
- Say what happened: "Head rose 1.1 in at impact," not "AI-powered insights."
- Never: "unlock," "elevate," "seamless," "revolutionize," "game-changer," "powered by AI."

## Banned
Gradients (except a subtle black scrim over video), glassmorphism/blur panels, purple/blue "AI" palettes, emoji, icon-in-circle feature grids, three-card feature sections, stock photos, illustrations, drop shadows on cards, more than one accent color, centered body text over 2 lines, text below 11px.

## Verification
After any UI change:
1. `npm run lint && npm run typecheck && npm run test`, then check the features the change touches still work in
   `npm run dev` (drawing, compare jump/sync, positions, pose + checks, persistence after reload).
2. Screenshot at 1440×900, 1024×1366 (iPad portrait), and 390×844 using Playwright (set up in Phase 4; until then,
   use the browser at those sizes). Screenshots go in the scratchpad, not the repo.
3. Check against this file: tokens only, one accent, one primary button, no banned items, focus states visible.
4. Fix and re-screenshot until clean, then summarize changes with before/after screenshots.
