-- Cube Bench database schema (Supabase / Postgres).
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: every statement is IF NOT EXISTS.

-- Accounts. Replaces the old server/data/users.jsonl file.
create table if not exists users (
  id                 text primary key,
  key                text unique not null,   -- provider-scoped identity, e.g. "email:a@b.com"
  provider           text not null,          -- "google" | "email"
  email              text not null,
  name               text not null,
  password_hash      text,                   -- scrypt "salt:hash", email accounts only
  created_at         timestamptz not null default now(),
  profile            jsonb not null default '{}'::jsonb,
  stripe_customer_id text,
  sub_status         text,                   -- trialing | active | past_due | canceled | incomplete | none
  current_period_end bigint,                 -- epoch ms the paid period ends
  promo_until        bigint                  -- epoch ms the free "first 100" month ends
);
create index if not exists users_stripe_customer_idx on users (stripe_customer_id);
-- If the users table predates the promo, add the column (safe to re-run):
alter table users add column if not exists promo_until bigint;

-- Login sessions. Replaces the old in-memory session map, so logins survive
-- restarts and deploys.
create table if not exists sessions (
  token      text primary key,
  user_id    text not null references users (id) on delete cascade,
  expires_at bigint not null                 -- epoch ms
);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- Pre-launch email capture. Replaces server/data/early-access.jsonl.
create table if not exists early_access (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- Bug reports and suggestions from the in-app feedback form.
create table if not exists feedback (
  id         bigint generated always as identity primary key,
  kind       text not null,                                 -- 'bug' | 'suggestion'
  message    text not null,
  email      text,                                          -- optional contact address
  user_id    text references users (id) on delete set null, -- set when signed in
  path       text,                                          -- page the user was on
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on feedback (created_at desc);

-- Row Level Security. Our server connects with the full Postgres role, which
-- BYPASSES RLS, so these queries are unaffected. But Supabase auto-exposes a
-- public REST API (anon key) for public-schema tables; enabling RLS with NO
-- policies denies that API all access, so no one can read these tables —
-- including password hashes — through it. Do not add policies.
alter table users        enable row level security;
alter table sessions     enable row level security;
alter table early_access enable row level security;

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
