create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.video_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  thumbnail_path text,
  duration_seconds numeric not null default 0,
  fps integer,
  orientation text not null check (orientation in ('face-on', 'down-the-line')),
  club_tag text not null,
  upload_status text not null check (upload_status in ('ready', 'processing')),
  source_type text not null check (source_type in ('user', 'pro')),
  created_at timestamptz not null default now()
);

create table if not exists public.pro_swings (
  id uuid primary key default gen_random_uuid(),
  golfer_name text not null,
  handedness text not null check (handedness in ('left', 'right')),
  club_type text not null,
  tags text[] not null default '{}',
  publish_status text not null check (publish_status in ('draft', 'published')),
  orientation text not null check (orientation in ('face-on', 'down-the-line')),
  video_asset_id uuid not null references public.video_assets(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  primary_video_id uuid not null references public.video_assets(id) on delete cascade,
  secondary_video_id uuid references public.video_assets(id) on delete set null,
  selected_pro_swing_id uuid references public.pro_swings(id) on delete set null,
  sync_enabled boolean not null default false,
  notes text not null default '',
  playback_defaults jsonb not null default '{"speed": 0.25}'::jsonb,
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.analysis_sessions(id) on delete cascade,
  pane_id text not null check (pane_id in ('primary', 'secondary')),
  shape_type text not null check (shape_type in ('line', 'arrow', 'rectangle', 'circle', 'angle', 'freehand')),
  geometry jsonb not null,
  style jsonb not null,
  label text,
  frame_binding numeric,
  z_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.snapshot_markers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.analysis_sessions(id) on delete cascade,
  pane_id text not null check (pane_id in ('primary', 'secondary')),
  label text not null,
  time_seconds numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.video_assets enable row level security;
alter table public.pro_swings enable row level security;
alter table public.analysis_sessions enable row level security;
alter table public.annotations enable row level security;
alter table public.snapshot_markers enable row level security;

create policy "profiles are self readable"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles are self writable"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "users read own videos"
  on public.video_assets
  for select
  using (
    auth.uid() = owner_id
    or (source_type = 'pro')
  );

create policy "users insert own videos"
  on public.video_assets
  for insert
  with check (auth.uid() = owner_id);

create policy "users update own videos"
  on public.video_assets
  for update
  using (auth.uid() = owner_id);

create policy "published pro swings are readable"
  on public.pro_swings
  for select
  using (publish_status = 'published');

create policy "users read own sessions"
  on public.analysis_sessions
  for select
  using (auth.uid() = user_id);

create policy "users insert own sessions"
  on public.analysis_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "users update own sessions"
  on public.analysis_sessions
  for update
  using (auth.uid() = user_id);

create policy "users read annotations for own sessions"
  on public.annotations
  for select
  using (
    exists (
      select 1
      from public.analysis_sessions sessions
      where sessions.id = annotations.session_id
        and sessions.user_id = auth.uid()
    )
  );

create policy "users write annotations for own sessions"
  on public.annotations
  for all
  using (
    exists (
      select 1
      from public.analysis_sessions sessions
      where sessions.id = annotations.session_id
        and sessions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.analysis_sessions sessions
      where sessions.id = annotations.session_id
        and sessions.user_id = auth.uid()
    )
  );

create policy "users read markers for own sessions"
  on public.snapshot_markers
  for select
  using (
    exists (
      select 1
      from public.analysis_sessions sessions
      where sessions.id = snapshot_markers.session_id
        and sessions.user_id = auth.uid()
    )
  );

create policy "users write markers for own sessions"
  on public.snapshot_markers
  for all
  using (
    exists (
      select 1
      from public.analysis_sessions sessions
      where sessions.id = snapshot_markers.session_id
        and sessions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.analysis_sessions sessions
      where sessions.id = snapshot_markers.session_id
        and sessions.user_id = auth.uid()
    )
  );
