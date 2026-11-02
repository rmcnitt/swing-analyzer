# Swing Analyzer

Swing Analyzer is a Next.js MVP for reviewing golf swing video with side-by-side comparison, drawing tools, saved study sessions, and a starter pro reference library.

## Stack

- `Next.js` App Router with `TypeScript`
- `Tailwind CSS`
- `react-konva` for drawing overlays
- IndexedDB for local video + session storage
- `Vitest` for unit tests

## What is implemented

- Marketing landing page
- Dashboard with seeded analysis sessions and uploaded videos
- Analysis and compare workspaces
- Slow playback, scrubbing, frame stepping, and speed controls
- Drawing tools: line, arrow, rectangle, circle, angle, and freehand
- Side-by-side comparison with sync toggle
- Local autosave for sessions (IndexedDB)
- Pro swing library screen

## Local development

Fastest option:

```bash
npm run local
```

That command:

- uses a temporary npm cache to avoid the local permissions issue
- installs dependencies if needed
- starts the dev server at `http://localhost:3000`

Manual option:

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm run dev
```

3. Open `http://localhost:3000`.

## Data & privacy

Swing Analyzer runs entirely in the browser. Imported videos, sessions, drawings, and markers are stored in
IndexedDB on your device; nothing is uploaded to a server and no account is needed.

## Tests

```bash
npm run lint
npm run test
```
