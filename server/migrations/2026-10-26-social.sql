-- ======================================================================
-- Social features (2026-10-26): cloud-saved timer sessions, public
-- profiles, following, practice PBs, simulator round leaderboards.
--
-- Paste into the Supabase SQL Editor and run once. Safe to re-run: every
-- statement is IF NOT EXISTS. Until this has run, the API answers social
-- requests with 503 "social_unavailable" and the app hides social features.
--
-- Moderation is manual: set hidden_at on a profile or a result to take it
-- off every public page, e.g.
--   update profiles set hidden_at = now() where handle_lower = 'someone';
--   update sim_results set hidden_at = now() where id = '...';
-- ======================================================================

-- Opt-in public profile. Private by default; a row exists once a handle is
-- claimed. handle keeps the typed case for display; handle_lower is the
-- case-insensitive identity used in URLs and lookups.
create table if not exists profiles (
  user_id      text primary key references users (id) on delete cascade,
  handle       text not null,
  handle_lower text not null unique,
  is_public    boolean not null default false,
  bio          text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  hidden_at    timestamptz                       -- set by moderation
);
-- Handle prefix search over public profiles (LIKE 'abc%' needs pattern ops).
create index if not exists profiles_public_handle_idx
  on profiles (handle_lower text_pattern_ops)
  where is_public and hidden_at is null;

-- Who follows whom. One-directional, like most sports apps.
create table if not exists follows (
  follower_id text not null references users (id) on delete cascade,
  followee_id text not null references users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on follows (followee_id);
create index if not exists follows_follower_created_idx on follows (follower_id, created_at desc);

-- Practice personal bests per event, computed by the client from its synced
-- sessions and checked against per-event plausibility floors. Times in ms.
create table if not exists user_pbs (
  user_id     text not null references users (id) on delete cascade,
  event       text not null,
  single_ms   integer,
  ao5_ms      integer,
  ao12_ms     integer,
  solve_count integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, event)
);

-- Simulated competition rounds. The server recomputes the WCA average and
-- best single from the attempts. Only each user's FIRST attempt at a round
-- (attempt_no = 1) counts on that round's board; later ones are reruns.
create table if not exists sim_results (
  id            text primary key,                 -- 12 random bytes, base64url
  user_id       text not null references users (id) on delete cascade,
  comp_id       text not null,
  comp_name     text not null,
  event_id      text not null,
  round_type_id text not null,
  group_id      text,
  attempts      jsonb not null,                   -- [{rawMs, plus2, dnf}]
  average_cs    integer,                          -- null = DNF
  best_cs       integer,                          -- null = all DNF
  placement     integer,                          -- client-reported, bounded
  field_size    integer,
  attempt_no    integer not null default 1,
  created_at    timestamptz not null default now(),
  hidden_at     timestamptz                       -- set by moderation
);
create index if not exists sim_results_board_idx
  on sim_results (comp_id, event_id, round_type_id, average_cs, best_cs)
  where attempt_no = 1 and hidden_at is null;
create unique index if not exists sim_results_first_attempt_idx
  on sim_results (user_id, comp_id, event_id, round_type_id)
  where attempt_no = 1;
create index if not exists sim_results_user_idx on sim_results (user_id, created_at desc);

-- Cloud-saved practice sessions (private). One meta row per session; delete
-- is a tombstone (deleted = true, no chunks) so it reaches other devices.
-- Timestamps are the client's epoch ms (last writer wins per session).
create table if not exists timer_sessions (
  user_id      text not null references users (id) on delete cascade,
  id           text not null,
  name         text not null,
  event        text not null,
  sort_order   integer not null default 0,
  created_at   bigint not null,
  updated_at   bigint not null,
  deleted      boolean not null default false,
  chunk_count  integer not null default 0,
  chunk_hashes jsonb not null default '[]'::jsonb,
  solve_count  integer not null default 0,
  primary key (user_id, id)
);

-- A session's solves in fixed-size chunks of compact JSON (TOAST compresses
-- the text). n = solves in the chunk, bytes = text length; both are summed
-- for the per-user caps without reading the data.
create table if not exists timer_chunks (
  user_id    text not null references users (id) on delete cascade,
  session_id text not null,
  idx        integer not null,
  hash       text not null,
  n          integer not null,
  bytes      integer not null,
  data       text not null,
  primary key (user_id, session_id, idx)
);

-- Same rule as every other table: RLS on with NO policies, so Supabase's
-- auto-generated public REST API can't read or write these. Our server's
-- role bypasses RLS.
alter table profiles       enable row level security;
alter table follows        enable row level security;
alter table user_pbs       enable row level security;
alter table sim_results    enable row level security;
alter table timer_sessions enable row level security;
alter table timer_chunks   enable row level security;
