import express from "express";
import { randomBytes } from "node:crypto";
import { sql } from "../db.ts";
import { TTL, withCache } from "../cache.ts";
import { userForToken } from "../auth.ts";
import { bearerToken, requireUser, wrap } from "../http.ts";
import { isSupportedEvent } from "../wcaEvents.ts";
import { ROUND_TYPES } from "../roundTypes.ts";
import { isMissingTable, isUniqueViolation, SocialError, UNAVAILABLE } from "../social/errors.ts";
import { checkHandle, likePrefix } from "../social/handles.ts";
import { isPbEvent, plausibleAverage, plausibleSingle } from "../social/plausibility.ts";
import { allowHit, BUDGETS } from "../social/rateLimit.ts";
import { averageCs, bestCs, parseAttempts } from "../social/scoring.ts";
import { parseIdxList, parsePutBody, SESSION_ID_RE } from "../social/syncCodec.ts";
import { getManifest, getSessionChunks, putSession } from "../social/syncStore.ts";

/**
 * Social features: cloud-saved timer sessions, personal bests, opt-in public
 * profiles and following, simulator round leaderboards and share links.
 *
 * Privacy defaults: profiles are private until the owner makes them public;
 * leaderboards and search only ever list public profiles (by handle); emails
 * are never returned. If the social tables don't exist yet (the migration
 * hasn't been run), every route answers 503 "social_unavailable" and the
 * client quietly hides these features.
 */
export const socialRouter = express.Router();

type Req = express.Request;
type Res = express.Response;

/** Wrap a handler: map missing tables and SocialErrors to clean responses. */
const social = (fn: (req: Req, res: Res) => Promise<unknown>) =>
  wrap(async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (isMissingTable(err)) {
        res.status(503).json(UNAVAILABLE);
        return;
      }
      if (err instanceof SocialError) {
        res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
        return;
      }
      throw err;
    }
  });

/** Per-user write budget; answers 429 itself when exceeded. */
function budget(res: Res, userId: string, name: keyof typeof BUDGETS): boolean {
  const b = BUDGETS[name];
  if (allowHit(`${name}:${userId}`, b.max, b.windowMs)) return true;
  res.status(429).json({ error: "Too many requests — slow down a little." });
  return false;
}

const noStore = (res: Res) => res.set("Cache-Control", "private, no-store");
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- cloud-saved timer sessions ----------

socialRouter.get(
  "/api/sync/manifest",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    noStore(res);
    res.json({ sessions: await getManifest(user.id) });
  }),
);

socialRouter.get(
  "/api/sync/sessions/:id",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const id = String(req.params.id);
    if (!SESSION_ID_RE.test(id)) throw new SocialError(400, "bad_id", "Invalid session id.");
    const out = await getSessionChunks(user.id, id, parseIdxList(req.query.idx));
    if (!out) throw new SocialError(404, "not_found", "That session isn't saved.");
    noStore(res);
    res.json(out);
  }),
);

socialRouter.put(
  "/api/sync/sessions/:id",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "syncWrite")) return;
    const id = String(req.params.id);
    if (!SESSION_ID_RE.test(id)) throw new SocialError(400, "bad_id", "Invalid session id.");
    const parsed = parsePutBody(req.body);
    if (!parsed.ok) throw new SocialError(400, "bad_body", parsed.error);
    noStore(res);
    res.json(await putSession(user.id, id, parsed.body));
  }),
);

/** Practice personal bests per event (computed on the device from synced times). */
socialRouter.put(
  "/api/social/pbs",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "pbs")) return;
    const raw = (req.body?.pbs ?? {}) as Record<string, Record<string, unknown>>;
    const ms = (v: unknown, ok: (n: number) => boolean) =>
      typeof v === "number" && Number.isFinite(v) && ok(v) ? Math.round(v) : null;
    const rows = Object.entries(raw)
      .filter(([event]) => isPbEvent(event))
      .slice(0, 30)
      .map(([event, p]) => ({
        user_id: user.id,
        event,
        single_ms: ms(p?.single, (n) => plausibleSingle(event, n)),
        ao5_ms: ms(p?.ao5, (n) => plausibleAverage(event, n)),
        ao12_ms: ms(p?.ao12, (n) => plausibleAverage(event, n)),
        solve_count: Math.max(0, Math.min(10_000_000, Math.floor(Number(p?.count) || 0))),
      }));
    if (rows.length) {
      await sql`
        insert into user_pbs ${sql(rows, "user_id", "event", "single_ms", "ao5_ms", "ao12_ms", "solve_count")}
        on conflict (user_id, event) do update set
          single_ms = excluded.single_ms, ao5_ms = excluded.ao5_ms, ao12_ms = excluded.ao12_ms,
          solve_count = excluded.solve_count, updated_at = now()
      `;
    }
    res.json({ status: "ok", saved: rows.length });
  }),
);

// ---------- profiles ----------

type ProfileRow = { handle: string; is_public: boolean; bio: string };

/** Your own social profile (private view). */
socialRouter.get(
  "/api/social/me",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const rows = await sql<ProfileRow[]>`
      select handle, is_public, bio from profiles where user_id = ${user.id}
    `;
    noStore(res);
    const p = rows[0];
    res.json({ profile: p ? { handle: p.handle, isPublic: p.is_public, bio: p.bio } : null });
  }),
);

socialRouter.get(
  "/api/social/handles/:handle",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "profile")) return;
    const check = checkHandle(req.params.handle);
    if (!check.ok) {
      res.json({ available: false, reason: check.reason });
      return;
    }
    const taken = await sql`
      select 1 from profiles where handle_lower = ${check.lower} and user_id <> ${user.id}
    `;
    res.json({ available: taken.length === 0, reason: taken.length ? "taken" : undefined });
  }),
);

socialRouter.put(
  "/api/social/profile",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "profile")) return;
    const check = checkHandle(req.body?.handle);
    if (!check.ok) {
      const msg =
        check.reason === "invalid"
          ? "Usernames are 3 to 20 letters, numbers or underscores."
          : "That username isn't available.";
      throw new SocialError(400, `handle_${check.reason}`, msg);
    }
    const isPublic = req.body?.isPublic === true;
    const bio = str(req.body?.bio, 160);
    try {
      await sql`
        insert into profiles (user_id, handle, handle_lower, is_public, bio)
        values (${user.id}, ${check.handle}, ${check.lower}, ${isPublic}, ${bio})
        on conflict (user_id) do update set
          handle = excluded.handle, handle_lower = excluded.handle_lower,
          is_public = excluded.is_public, bio = excluded.bio, updated_at = now()
      `;
    } catch (err) {
      if (isUniqueViolation(err)) throw new SocialError(409, "handle_taken", "That username is taken.");
      throw err;
    }
    res.json({ profile: { handle: check.handle, isPublic, bio } });
  }),
);

type PbRow = { event: string; single_ms: number | null; ao5_ms: number | null; ao12_ms: number | null; solve_count: number };

const pbView = (r: PbRow) => ({
  event: r.event,
  single: r.single_ms,
  ao5: r.ao5_ms,
  ao12: r.ao12_ms,
  count: r.solve_count,
});

/** The display name a public profile shows (never the email). */
const displayNameSql = sql`coalesce(nullif(u.profile->>'displayName', ''), u.name)`;

/**
 * A public profile. Private, hidden and unknown handles all give the same
 * 404, so private accounts can't be discovered.
 */
socialRouter.get(
  "/api/u/:handle",
  social(async (req, res) => {
    const lower = String(req.params.handle).toLowerCase().slice(0, 20);
    const viewer = await userForToken(bearerToken(req));
    const base = await withCache(`profile:${lower}`, 30_000, async () => {
      const rows = await sql<
        {
          user_id: string;
          handle: string;
          bio: string;
          display_name: string;
          wca_id: string | null;
          wca_verified: string | null;
          created_at: Date;
          followers: number;
          following: number;
        }[]
      >`
        select p.user_id, p.handle, p.bio, ${displayNameSql} as display_name,
               u.profile->>'wcaId' as wca_id, u.profile->>'wcaVerifiedAt' as wca_verified,
               u.created_at,
               (select count(*)::int from follows f where f.followee_id = p.user_id) as followers,
               (select count(*)::int from follows f where f.follower_id = p.user_id) as following
        from profiles p join users u on u.id = p.user_id
        where p.handle_lower = ${lower} and p.is_public and p.hidden_at is null
      `;
      const p = rows[0];
      if (!p) return null;
      const [pbs, results] = await Promise.all([
        sql<PbRow[]>`select event, single_ms, ao5_ms, ao12_ms, solve_count from user_pbs where user_id = ${p.user_id} order by event`,
        sql<{ id: string; comp_name: string; event_id: string; round_type_id: string; average_cs: number | null; placement: number | null; field_size: number | null; created_at: Date }[]>`
          select id, comp_name, event_id, round_type_id, average_cs, placement, field_size, created_at
          from sim_results
          where user_id = ${p.user_id} and attempt_no = 1 and hidden_at is null
          order by created_at desc limit 10
        `,
      ]);
      return {
        userId: p.user_id,
        profile: {
          handle: p.handle,
          displayName: p.display_name,
          bio: p.bio,
          wcaId: p.wca_id && p.wca_verified ? p.wca_id : null,
          memberSince: new Date(p.created_at).toISOString().slice(0, 7),
          followers: p.followers,
          following: p.following,
          pbs: pbs.map(pbView),
          results: results.map((r) => ({
            id: r.id,
            compName: r.comp_name,
            eventId: r.event_id,
            roundTypeId: r.round_type_id,
            averageCs: r.average_cs,
            placement: r.placement,
            fieldSize: r.field_size,
            at: new Date(r.created_at).toISOString(),
          })),
        },
      };
    });
    if (!base) {
      res.status(404).json({ error: "No public profile with that username." });
      return;
    }
    let followedByMe = false;
    if (viewer && viewer.id !== base.userId) {
      const f = await sql`select 1 from follows where follower_id = ${viewer.id} and followee_id = ${base.userId}`;
      followedByMe = f.length > 0;
    }
    noStore(res);
    res.json({ ...base.profile, isMe: viewer?.id === base.userId, followedByMe });
  }),
);

// ---------- following ----------

async function publicUserId(handle: string): Promise<string> {
  const rows = await sql<{ user_id: string }[]>`
    select user_id from profiles
    where handle_lower = ${handle.toLowerCase().slice(0, 20)} and is_public and hidden_at is null
  `;
  if (!rows[0]) throw new SocialError(404, "not_found", "No public profile with that username.");
  return rows[0].user_id;
}

socialRouter.post(
  "/api/follows/:handle",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "follow")) return;
    const target = await publicUserId(String(req.params.handle));
    if (target === user.id) throw new SocialError(400, "self", "You can't follow yourself.");
    await sql`
      insert into follows (follower_id, followee_id) values (${user.id}, ${target})
      on conflict do nothing
    `;
    res.json({ following: true });
  }),
);

socialRouter.delete(
  "/api/follows/:handle",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "follow")) return;
    const target = await publicUserId(String(req.params.handle));
    await sql`delete from follows where follower_id = ${user.id} and followee_id = ${target}`;
    res.json({ following: false });
  }),
);

/**
 * The friends board: you plus everyone you follow (public profiles only),
 * with personal bests for one event.
 */
socialRouter.get(
  "/api/friends",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const event = typeof req.query.event === "string" && isPbEvent(req.query.event) ? req.query.event : "333";
    const rows = await sql<
      { user_id: string; handle: string | null; display_name: string; single_ms: number | null; ao5_ms: number | null; ao12_ms: number | null; solve_count: number | null }[]
    >`
      with people as (
        select followee_id as user_id from follows where follower_id = ${user.id}
        union select ${user.id}
      )
      select u.id as user_id, p.handle, ${displayNameSql} as display_name,
             b.single_ms, b.ao5_ms, b.ao12_ms, b.solve_count
      from people x
      join users u on u.id = x.user_id
      left join profiles p on p.user_id = u.id
      left join user_pbs b on b.user_id = u.id and b.event = ${event}
      where u.id = ${user.id} or (p.is_public and p.hidden_at is null)
      limit 501
    `;
    noStore(res);
    res.json({
      event,
      people: rows.map((r) => ({
        handle: r.handle,
        displayName: r.display_name,
        isMe: r.user_id === user.id,
        single: r.single_ms,
        ao5: r.ao5_ms,
        ao12: r.ao12_ms,
        count: r.solve_count ?? 0,
      })),
    });
  }),
);

/** Find public profiles by username prefix. */
socialRouter.get(
  "/api/social/search",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "follow")) return;
    const q = str(req.query.q, 20).toLowerCase().replace(/^@/, "");
    if (q.length < 2) {
      res.json({ people: [] });
      return;
    }
    const rows = await sql<{ handle: string; display_name: string }[]>`
      select p.handle, ${displayNameSql} as display_name
      from profiles p join users u on u.id = p.user_id
      where p.is_public and p.hidden_at is null and p.handle_lower like ${likePrefix(q)}
      order by p.handle_lower limit 20
    `;
    noStore(res);
    res.json({ people: rows.map((r) => ({ handle: r.handle, displayName: r.display_name })) });
  }),
);

// ---------- simulator results, round leaderboards, share links ----------

socialRouter.post(
  "/api/sim-results",
  social(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user || !budget(res, user.id, "simResult")) return;
    const b = req.body ?? {};
    const compId = str(b.compId, 64);
    const eventId = str(b.eventId, 16);
    const roundTypeId = str(b.roundTypeId, 4);
    if (!/^[A-Za-z0-9]{3,64}$/.test(compId) || !isSupportedEvent(eventId) || !(roundTypeId in ROUND_TYPES)) {
      throw new SocialError(400, "bad_round", "Unknown competition round.");
    }
    const parsed = parseAttempts(eventId, b.attempts);
    if (!parsed.ok) throw new SocialError(400, "bad_attempts", parsed.error);
    const avg = averageCs(parsed.attempts, parsed.format);
    const best = bestCs(parsed.attempts);
    if (avg !== null && !plausibleAverage(eventId, avg * 10)) {
      throw new SocialError(400, "implausible", "That result is faster than the world record.");
    }
    const bound = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 100_000 ? v : null;
    const id = randomBytes(12).toString("base64url");
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from sim_results
      where user_id = ${user.id} and comp_id = ${compId} and event_id = ${eventId} and round_type_id = ${roundTypeId}
    `;
    await sql`
      insert into sim_results (id, user_id, comp_id, comp_name, event_id, round_type_id, group_id,
                               attempts, average_cs, best_cs, placement, field_size, attempt_no)
      values (${id}, ${user.id}, ${compId}, ${str(b.compName, 120) || compId}, ${eventId}, ${roundTypeId},
              ${str(b.groupId, 3) || null}, ${sql.json(parsed.attempts)}, ${avg}, ${best},
              ${bound(b.placement)}, ${bound(b.fieldSize)}, ${n + 1})
    `;
    res.json({ id, attemptNo: n + 1, averageCs: avg });
  }),
);

/**
 * Cube Bench players on one round: first attempts only (later runs are
 * practice on known scrambles), public profiles listed by handle, ranked by
 * average then best single. "you" is the caller's own row, public or not.
 */
socialRouter.get(
  "/api/competitions/:id/board",
  social(async (req, res) => {
    const compId = String(req.params.id).slice(0, 64);
    const eventId = typeof req.query.event === "string" ? req.query.event : "333";
    const roundTypeId = typeof req.query.roundTypeId === "string" ? req.query.roundTypeId : "1";
    if (!isSupportedEvent(eventId) || !(roundTypeId in ROUND_TYPES)) {
      throw new SocialError(400, "bad_round", "Unknown competition round.");
    }
    const board = await withCache(`board:${compId}:${eventId}:${roundTypeId}`, 60_000, async () => {
      const [rows, [{ count }]] = await Promise.all([
        sql<{ handle: string; display_name: string; average_cs: number | null; best_cs: number | null }[]>`
          select p.handle, ${displayNameSql} as display_name, r.average_cs, r.best_cs
          from sim_results r
          join profiles p on p.user_id = r.user_id and p.is_public and p.hidden_at is null
          join users u on u.id = r.user_id
          where r.comp_id = ${compId} and r.event_id = ${eventId} and r.round_type_id = ${roundTypeId}
            and r.attempt_no = 1 and r.hidden_at is null
          order by r.average_cs asc nulls last, r.best_cs asc nulls last
          limit 50
        `,
        sql<{ count: number }[]>`
          select count(*)::int as count from sim_results
          where comp_id = ${compId} and event_id = ${eventId} and round_type_id = ${roundTypeId}
            and attempt_no = 1 and hidden_at is null
        `,
      ]);
      return {
        count,
        top: rows.map((r) => ({
          handle: r.handle,
          displayName: r.display_name,
          averageCs: r.average_cs,
          bestCs: r.best_cs,
        })),
      };
    });
    const viewer = await userForToken(bearerToken(req));
    let you: { averageCs: number | null; bestCs: number | null; rank: number } | null = null;
    if (viewer) {
      const mine = await sql<{ average_cs: number | null; best_cs: number | null; rank: number }[]>`
        with me as (
          select average_cs, best_cs from sim_results
          where user_id = ${viewer.id} and comp_id = ${compId} and event_id = ${eventId}
            and round_type_id = ${roundTypeId} and attempt_no = 1
        )
        select me.average_cs, me.best_cs,
          1 + (select count(*)::int from sim_results r
               where r.comp_id = ${compId} and r.event_id = ${eventId} and r.round_type_id = ${roundTypeId}
                 and r.attempt_no = 1 and r.hidden_at is null
                 and (coalesce(r.average_cs, 2147483647) < coalesce(me.average_cs, 2147483647)
                   or (coalesce(r.average_cs, 2147483647) = coalesce(me.average_cs, 2147483647)
                       and coalesce(r.best_cs, 2147483647) < coalesce(me.best_cs, 2147483647)))) as rank
        from me
      `;
      if (mine[0]) you = { averageCs: mine[0].average_cs, bestCs: mine[0].best_cs, rank: mine[0].rank };
    }
    noStore(res);
    res.json({ ...board, you });
  }),
);

/** A shared result (unguessable id). Shows a name only for public profiles. */
socialRouter.get(
  "/api/sim-results/:id",
  social(async (req, res) => {
    const id = String(req.params.id);
    if (!/^[A-Za-z0-9_-]{16}$/.test(id)) throw new SocialError(404, "not_found", "That result doesn't exist.");
    const out = await withCache(`simres:${id}`, TTL.SHORT_MS, async () => {
      const rows = await sql<
        { comp_id: string; comp_name: string; event_id: string; round_type_id: string; group_id: string | null; attempts: unknown; average_cs: number | null; placement: number | null; field_size: number | null; created_at: Date; handle: string | null; display_name: string | null }[]
      >`
        select r.comp_id, r.comp_name, r.event_id, r.round_type_id, r.group_id, r.attempts,
               r.average_cs, r.placement, r.field_size, r.created_at,
               case when p.is_public and p.hidden_at is null then p.handle end as handle,
               case when p.is_public and p.hidden_at is null then ${displayNameSql} end as display_name
        from sim_results r
        join users u on u.id = r.user_id
        left join profiles p on p.user_id = r.user_id
        where r.id = ${id} and r.hidden_at is null
      `;
      const r = rows[0];
      if (!r) return null;
      return {
        compId: r.comp_id,
        compName: r.comp_name,
        eventId: r.event_id,
        roundTypeId: r.round_type_id,
        groupId: r.group_id,
        attempts: r.attempts,
        averageCs: r.average_cs,
        placement: r.placement,
        fieldSize: r.field_size,
        at: new Date(r.created_at).toISOString(),
        handle: r.handle,
        displayName: r.display_name,
      };
    });
    if (!out) throw new SocialError(404, "not_found", "That result doesn't exist.");
    res.set("Cache-Control", "public, max-age=60");
    res.json(out);
  }),
);
