import express from "express";
import { TTL, withCache } from "../cache.ts";
import { ROUND_TYPES } from "../roundTypes.ts";
import { isSupportedEvent } from "../wcaEvents.ts";
import { limit, wrap } from "../http.ts";
import {
  getCompetition,
  getCompetitionEvents,
  getCompetitionHighlight,
  getEventRanking,
  getEventRounds,
  getEventRoundScrambles,
  getRecentCompetitions,
  getRoundCutoff,
  getWcaPerson,
  isValidWcaId,
  searchCompetitions,
  WcaError,
} from "../wca.ts";

/**
 * WCA data endpoints: competition search, events, rounds, scrambles, rankings
 * and person records. Everything here is public — the whole library is free —
 * so none of these routes depend on who is asking.
 */
export const dataRouter = express.Router();

const searchLimiter = limit(60 * 1000, 60); // 60 / min

/**
 * Cache-Control for public data, so Vercel's CDN answers repeat requests
 * without running the function or calling the WCA at all:
 *   "past"  — a finished competition's data never changes: cache for a day at
 *             the edge and serve stale for a week while refreshing.
 *   "list"  — search and the recent feed: fresh within ~10 minutes, so newly
 *             published competitions show up on their own.
 *   "live"  — an in-progress competition's results: a minute or two.
 * (Responses must not depend on who is asking — none of these do.)
 */
function cacheFor(res: express.Response, kind: "past" | "list" | "live"): void {
  res.set(
    "Cache-Control",
    kind === "past"
      ? "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
      : kind === "list"
        ? "public, max-age=60, s-maxage=600, stale-while-revalidate=86400"
        : "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
  );
}

/** Was this competition already over? Drives cache TTL. */
async function isFinished(id: string): Promise<boolean> {
  try {
    const comp = await withCache(`comp:${id}`, TTL.SHORT_MS, () =>
      getCompetition(id),
    );
    if (!comp.end_date) return false;
    // end_date is date-only (UTC midnight at the START of the final day);
    // the comp is only over once that whole day has passed. Otherwise an
    // in-progress comp's partial results get cached for 24h.
    const DAY_MS = 24 * 60 * 60 * 1000;
    return new Date(comp.end_date).getTime() + DAY_MS < Date.now();
  } catch {
    return false; // when unsure, treat as live and cache conservatively
  }
}

/** Read + validate the `event` query param; defaults to 3x3. Writes a 400
 *  and returns null on an unsupported event. */
function eventParam(req: express.Request, res: express.Response): string | null {
  const event =
    typeof req.query.event === "string" && req.query.event ? req.query.event : "333";
  if (!isSupportedEvent(event)) {
    res.status(400).json({ error: `Unsupported event "${event}".` });
    return null;
  }
  return event;
}

// Searchable + browsable competition list: full-text, country + date filters,
// and pagination so the client can scroll to load more.
dataRouter.get(
  "/api/competitions",
  searchLimiter,
  wrap(async (req, res) => {
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const q = str(req.query.q);
    const country = str(req.query.country); // ISO-2, e.g. "US"
    const start = str(req.query.start); // YYYY-MM-DD
    const end = str(req.query.end);
    const page = Math.max(1, Math.min(50, Number(str(req.query.page)) || 1));
    // Bigger upstream pages: unpublished competitions are filtered out, and a
    // small page left the list half-empty.
    const perPage = 50;
    const key = `search:${q.toLowerCase()}|${country}|${start}|${end}|p${page}`;
    const { competitions, hasMore } = await withCache(key, TTL.SHORT_MS, () =>
      searchCompetitions({ q, country, start, end, page, perPage }),
    );
    cacheFor(res, "list");
    res.json({ competitions, page, hasMore });
  }),
);

// The newest competitions whose results + scrambles just went public.
dataRouter.get(
  "/api/competitions/recent",
  wrap(async (_req, res) => {
    const competitions = await withCache("recent", TTL.SHORT_MS, () =>
      getRecentCompetitions(),
    );
    cacheFor(res, "list");
    res.json({ competitions });
  }),
);

// A short summary card for a competition: location + date (from the comp) plus
// the 3x3 champion and event count.
dataRouter.get(
  "/api/competitions/:id/highlight",
  wrap(async (req, res) => {
    const { id } = req.params;
    const [comp, highlight] = await Promise.all([
      withCache(`comp:${id}`, TTL.SHORT_MS, () => getCompetition(id)),
      withCache(`highlight:${id}`, TTL.LONG_MS, () =>
        getCompetitionHighlight(id),
      ),
    ]);
    cacheFor(res, "past");
    res.json({ competition: comp, ...highlight });
  }),
);

// Which supported events this competition held (with a full scramble set).
dataRouter.get(
  "/api/competitions/:id/events",
  wrap(async (req, res) => {
    const { id } = req.params;
    const [comp, events] = await Promise.all([
      withCache(`comp:${id}`, TTL.SHORT_MS, () => getCompetition(id)),
      withCache(`events:${id}`, TTL.LONG_MS, () => getCompetitionEvents(id)),
    ]);
    // An empty answer may change once scrambles are uploaded: cache it briefly.
    cacheFor(res, events.length ? "past" : "list");
    res.json({ competition: comp, events });
  }),
);

// The solvable rounds of an event at a competition (first → final), for the
// round picker. Metadata only — scrambles come from /round.
dataRouter.get(
  "/api/competitions/:id/rounds",
  wrap(async (req, res) => {
    const { id } = req.params;
    const event = eventParam(req, res);
    if (!event) return;
    const [comp, data] = await Promise.all([
      withCache(`comp:${id}`, TTL.SHORT_MS, () => getCompetition(id)),
      withCache(`rounds:${id}:${event}`, TTL.LONG_MS, () =>
        getEventRounds(id, event),
      ),
    ]);
    cacheFor(res, data.available ? "past" : "list");
    res.json({
      competition: comp,
      event,
      available: data.available,
      reason: data.reason,
      rounds: data.rounds.map((r) => ({
        roundTypeId: r.roundTypeId,
        roundName: r.roundName,
      })),
    });
  }),
);

// A single round's scramble set. roundTypeId omitted → the first round.
dataRouter.get(
  "/api/competitions/:id/round",
  wrap(async (req, res) => {
    const { id } = req.params;
    const event = eventParam(req, res);
    if (!event) return;
    const roundTypeId =
      typeof req.query.roundTypeId === "string" ? req.query.roundTypeId : undefined;
    if (roundTypeId && !(roundTypeId in ROUND_TYPES)) {
      res.status(400).json({ error: `Unknown round type "${roundTypeId}".` });
      return;
    }
    // Scramble group: A..Z, then AA, AB… for very large rounds. Validated
    // shape only; a group the round doesn't have comes back unavailable.
    const group =
      typeof req.query.group === "string" && /^[A-Z]{1,3}$/.test(req.query.group)
        ? req.query.group
        : undefined;
    const [comp, round] = await Promise.all([
      withCache(`comp:${id}`, TTL.SHORT_MS, () => getCompetition(id)),
      // Scrambles are immutable once generated -> cache long, per (event, round, group).
      withCache(
        `round:${id}:${event}:${roundTypeId ?? "first"}:${group ?? "def"}`,
        TTL.LONG_MS,
        () => getEventRoundScrambles(id, event, roundTypeId, group),
      ),
    ]);
    cacheFor(res, round.available ? "past" : "list");
    res.json({ competition: comp, event, round });
  }),
);

// A combined round's cutoff (null for ordinary rounds). Separate from /round
// so the WCIF download never delays starting a round: the client fetches it
// in the background while the first attempts are solved.
dataRouter.get(
  "/api/competitions/:id/cutoff",
  wrap(async (req, res) => {
    const { id } = req.params;
    const event = eventParam(req, res);
    if (!event) return;
    const roundTypeId = typeof req.query.roundTypeId === "string" ? req.query.roundTypeId : "";
    if (!(roundTypeId in ROUND_TYPES)) {
      res.status(400).json({ error: `Unknown round type "${roundTypeId}".` });
      return;
    }
    const cutoff = await getRoundCutoff(id, event, roundTypeId);
    cacheFor(res, "past");
    res.json({ cutoff });
  }),
);

// Real competitors (named, WCA-ordered) for a given event round.
dataRouter.get(
  "/api/competitions/:id/ranking",
  wrap(async (req, res) => {
    const { id } = req.params;
    const event = eventParam(req, res);
    if (!event) return;
    const roundTypeId =
      typeof req.query.roundTypeId === "string" ? req.query.roundTypeId : "1";
    // Round codes are a small closed set; anything else is a bad request,
    // not a fresh cache key + upstream fetch.
    if (!(roundTypeId in ROUND_TYPES)) {
      res.status(400).json({ error: `Unknown round type "${roundTypeId}".` });
      return;
    }
    const finished = await isFinished(id);
    const ttl = finished ? TTL.LONG_MS : TTL.SHORT_MS;
    const ranking = await withCache(
      `ranking:${id}:${event}:${roundTypeId}`,
      ttl,
      () => getEventRanking(id, event, roundTypeId),
    );
    // The advancement fact comes from /results, but simulating the next round
    // needs its /scrambles. Cross-check so the client only offers to simulate
    // rounds that actually have a full scramble set (no dead-end button). This
    // is best-effort: if the scramble lookup fails, we still return the
    // ranking (solvable stays undefined -> the client hides the button but
    // keeps the advancement fact) rather than failing the whole request.
    let out = ranking;
    if (ranking.nextRound) {
      let solvable: boolean | undefined = undefined;
      try {
        const rounds = await withCache(`rounds:${id}:${event}`, TTL.LONG_MS, () =>
          getEventRounds(id, event),
        );
        solvable =
          rounds.available &&
          rounds.rounds.some(
            (r) => r.roundTypeId === ranking.nextRound!.roundTypeId,
          );
      } catch {
        /* scramble lookup unavailable — leave solvable undefined */
      }
      out = { ...ranking, nextRound: { ...ranking.nextRound, solvable } };
    }
    cacheFor(res, finished ? "past" : "live");
    res.json({ ranking: out });
  }),
);

// A person's official WCA personal records (single/average per event, in
// centiseconds). Bad ID format fails fast as a 400; unknown ID -> 404.
dataRouter.get(
  "/api/wca/person/:wcaId",
  wrap(async (req, res) => {
    const wcaId = String(req.params.wcaId).toUpperCase();
    if (!isValidWcaId(wcaId)) {
      throw new WcaError("That doesn't look like a WCA ID.", 400);
    }
    const person = await withCache(`wca-person:${wcaId}`, TTL.LONG_MS, () =>
      getWcaPerson(wcaId),
    );
    cacheFor(res, "list");
    res.json(person);
  }),
);

/** Readiness probe helper: can we reach the WCA API at all? */
export function probeWca(): Promise<boolean> {
  return withCache("ready:probe", 30_000, () =>
    searchCompetitions({}).then(() => true),
  );
}
