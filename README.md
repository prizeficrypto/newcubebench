# Cube Bench

A free speedcubing timer and WCA competition simulator. Open the site and
you're on the timer; the simulator lets you solve the real scrambles from a
real WCA round and see where you'd have placed against the people who were
there. Supported by ads (Google AdSense); no paid plans.

## What's in it

- **Timer** (`/app`, the front door) — csTimer-class practice timer:
  sessions per puzzle (all WCA events + "no scramble"), real random-state WCA
  scrambles (cubing.js) with history and your own scrambles, hold-to-start,
  WCA inspection (+2 after 15 s, DNF after 17 s) with spoken 8 s / 12 s calls
  (choose a male/female/system voice, volume, or a beep), multi-phase splits,
  focus mode, OK/+2/DNF and comments per solve, csTimer's keyboard shortcuts,
  typed times, **StackMat** (audio jack) and **GAN Smart Timer** (Bluetooth,
  beta) input, full stats (mo3/ao5/ao12/… current + best, csTimer trimming,
  WCA rounding), a time list that stays fast at 10k+ solves, tools (scramble
  image, trend, distribution, scramble generator, metronome), and
  import/export (csTimer JSON + CSV, Twisty Timer, Cubic Timer, plain lists).
- **Competitions** (`/app/competitions`) — pick any past WCA competition
  (a "Just published" list surfaces new ones automatically), an event and a
  round, solve its official scrambles, and get placed by WCA ranking rules.
- **Social** (with a free account) — times saved to your account across
  devices, an opt-in public profile with PBs, following friends + a friends
  leaderboard, Cube Bench leaderboards per simulated round, shareable results.
- **WCA account** — sign in with, or connect, a WCA account (OAuth) to verify
  your WCA ID.

## Architecture

```
client/   React + Vite + TS SPA
server/   Express API: WCA data proxy, accounts, social, feedback
api/      Vercel serverless entry (wraps the bundled Express app)
```

Server routers live in `server/src/routes/` (`data`, `account`, `social`,
`feedback`); `server/src/index.ts` composes them.

- **WCA data** is fetched from the public WCA API, trimmed, cached in memory,
  and sent with `Cache-Control: s-maxage` so Vercel's CDN serves repeat
  requests without running the function. Public data requests carry no
  Authorization header (that would bypass the CDN).
- **Practice sessions** live in IndexedDB (`client/src/lib/timer/storage.ts`);
  signed-in users sync them in hashed 200-solve chunks so only changed chunks
  upload (`client/src/lib/cloudSync.ts`, `server/src/social/`).
- **Translations** (fr/ko/es) load on demand; English visitors never
  download them.

### Correctness-critical logic

- `client/src/lib/cubing.ts` — simulator scoring per WCA Regulations: attempts
  truncated to the hundredth (whole seconds at 10:00+), Ao5 drops one best and
  one worst, mean of 3 for 6x6/7x7, averages rounded (to the second at 10:00+),
  placement by average then best single, ties share a position, DNF averages
  ranked after every valid average by best single.
- `client/src/lib/timer/stats.ts` — practice stats with csTimer's definitions
  (5% trimming, DNF rules) and WCA rounding.
- `client/src/lib/timer/engine.ts` — the timer state machine (pure, tested).

## Configuration

Server (`server/.env`, see `server/.env.example`):

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | **Required.** Supabase transaction-pooler URL (port 6543) |
| `APP_URL` | Public URL (WCA sign-in redirect) |
| `GOOGLE_CLIENT_ID` | Google sign-in |
| `WCA_CLIENT_ID`, `WCA_CLIENT_SECRET` | WCA sign-in / connect |
| `ADSENSE_PUBLISHER_ID` | Serves `/ads.txt` (e.g. `pub-123…`) |
| `CRON_SECRET` | Protects the daily database keep-alive |

Client (`client/.env`, see `client/.env.example`): `VITE_GOOGLE_CLIENT_ID`,
`VITE_ADSENSE_CLIENT` (`ca-pub-…`) and `VITE_ADSENSE_SLOT_*` ad-unit ids.
Anything unset simply stays off (no fake buttons, no empty ad boxes).

### One-time setup

1. **Database:** run `server/schema.sql` once in the Supabase SQL editor (it's
   idempotent). Upgrading an existing database only needs
   `server/migrations/2026-10-26-social.sql`. Until it's run, social features
   hide themselves.
2. **WCA sign-in:** register an app at
   https://www.worldcubeassociation.org/oauth/applications with redirect URI
   `<APP_URL>/auth/wca` and scope `public` (sign-in also asks for `email`).
3. **AdSense:** get approved, create one display unit per placement, set the
   env vars, and turn on Google's free EU consent message (Privacy &
   messaging) in AdSense. Note: Vercel's Hobby plan doesn't allow ads — use
   Vercel Pro or a host that permits commercial use.
4. **Supabase free tier** pauses projects after 7 days without database
   activity; `vercel.json` schedules a daily `/api/cron/keepalive` to prevent
   that (set `CRON_SECRET`).

## Running locally

Node 22.18+ (the server runs TypeScript directly via type-stripping).

```bash
cd server && npm install && npm start      # API on :4000
cd client && npm install && npm run dev    # app on :5173, proxies /api
```

## Verification

```bash
cd client && node src/lib/cubing.test.ts          # WCA scoring + placement
cd client && node src/lib/timer/stats.test.ts     # practice stats
cd client && node src/lib/timer/engine.test.ts    # timer state machine
cd client && node src/lib/timer/typing.test.ts    # typed-time parsing
cd server && node src/social/social.test.ts       # sync codec, handles, scoring
cd server && node src/wcaOauth.test.ts            # WCA OAuth state signing
cd server && npm run verify                       # real WCA fetch sanity check
cd client && npm run build                        # typecheck + production build
```
