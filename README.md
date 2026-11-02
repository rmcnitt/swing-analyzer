# Swing Analyzer

Swing Analyzer is a Next.js MVP for reviewing golf swing video with side-by-side comparison, drawing tools, saved study sessions, and a starter pro reference library.

## Stack

- `Next.js` App Router with `TypeScript`
- `Tailwind CSS`
- `react-konva` for drawing overlays
- `Supabase`-ready auth/data/storage scaffolding
- `Vitest` for unit tests

## What is implemented

- Marketing landing page
- Dashboard with seeded analysis sessions and uploaded videos
- Analysis and compare workspaces
- Slow playback, scrubbing, frame stepping, and speed controls
- Drawing tools: line, arrow, rectangle, circle, angle, and freehand
- Side-by-side comparison with sync toggle
- Local autosave for sessions until Supabase is configured
- Pro swing library screen
- Supabase schema and RLS migration scaffold

## Local development

Fastest option:

```bash
npm run local
```

That command:

- uses a temporary npm cache to avoid the local permissions issue
- installs dependencies if needed
- creates `.env.local` from `.env.example` if missing
- starts the dev server at `http://localhost:3000`

Manual option:

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Supabase hookup

Add these values to `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Apply the schema in [supabase/migrations/202604031500_init.sql](/Users/robbiemcnitt/Documents/SwingAnalyzer/supabase/migrations/202604031500_init.sql) to create the initial tables and policies.

The current repo runs in demo mode with seeded data and local session persistence. The next backend pass should replace the mock repository in [lib/data/repository.ts](/Users/robbiemcnitt/Documents/SwingAnalyzer/lib/data/repository.ts) with real Supabase queries and upload flows.

## Tests

```bash
npm run lint
npm run test
```
