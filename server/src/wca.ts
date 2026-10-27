import { roundName, roundOrder } from "./roundTypes.ts";
import { TTL, withCache } from "./cache.ts";
import { getEventDef, minScrambles, SUPPORTED_EVENTS } from "./wcaEvents.ts";

const WCA_BASE = "https://www.worldcubeassociation.org/api/v0";

/** Per-request budget for a single WCA call. */
const REQUEST_TIMEOUT_MS = 12_000;
/** Bounded retries for transient failures (network error / 5xx / 429). */
const MAX_RETRIES = 2;

// ---------- types mirroring the WCA payloads we consume ----------

export type WcaScramble = {
  event_id: string;
  round_type_id: string;
  group_id: string;
  is_extra: boolean;
  scramble_num: number;
  scramble: string;
};

export type WcaResult = {
  name: string;
  best: number; // centiseconds; <=0 means DNF/DNS
  average: number; // centiseconds; <=0 means DNF / no average
  pos: number;
  event_id: string;
  round_type_id: string;
  country_iso2: string;
  wca_id: string | null;
  attempts: number[];
};

export type WcaCompetition = {
  id: string;
  name: string;
  city?: string;
  country_iso2?: string;
  start_date?: string;
  end_date?: string;
};

export class WcaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WcaError";
    this.status = status;
  }
}

// ---------- low-level fetch with timeout + bounded backoff ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a WCA endpoint as JSON.
 * - Bounded per-attempt timeout via AbortController.
 * - Retries only transient failures (network error, 429, 5xx) with
 *   exponential backoff + jitter. 4xx (except 429) fail fast.
 * - A 404 returns { status: 404, data: null } to callers that expect it
 *   (e.g. scrambles never uploaded) rather than throwing.
 */
async function wcaFetch<T>(
  path: string,
): Promise<{ status: number; data: T | null }> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${WCA_BASE}${path}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (res.status === 404) {
        return { status: 404, data: null };
      }

      // Retry transient upstream failures with backoff.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new WcaError(`WCA upstream ${res.status}`, res.status);
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        // Other 4xx: fail fast, do not retry.
        throw new WcaError(`WCA responded ${res.status}`, res.status);
      }

      const data = (await res.json()) as T;
      return { status: res.status, data };
    } catch (err) {
      lastErr = err;
      const isAbort = err instanceof Error && err.name === "AbortError";
      const retryable = isAbort || err instanceof TypeError; // timeout or network
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      if (err instanceof WcaError) throw err;
      throw new WcaError(
        `Failed to reach WCA: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new WcaError("WCA request failed", 502);
}

function backoffMs(attempt: number): number {
  const base = 300 * 2 ** attempt; // 300, 600, ...
  const jitter = Math.random() * 200;
  return base + jitter;
}

// ---------- high-level operations ----------

/** Only the fields the app uses — the raw WCA object is ~25 KB (delegates…). */
function trimCompetition(
  c: WcaCompetition & { results_posted_at?: string | null },
): WcaCompetition & { results_posted_at?: string } {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    country_iso2: c.country_iso2,
    start_date: c.start_date,
    end_date: c.end_date,
    ...(c.results_posted_at ? { results_posted_at: c.results_posted_at } : {}),
  };
}

export async function getCompetition(id: string): Promise<WcaCompetition> {
  const { status, data } = await wcaFetch<WcaCompetition>(
    `/competitions/${encodeURIComponent(id)}`,
  );
  if (!data) throw new WcaError(`Competition "${id}" not found`, status || 404);
  return trimCompetition(data);
}

/**
 * The competitions whose results — and so scrambles — the WCA published most
 * recently, newest first. A competition appears here on its own as soon as
 * the WCA posts it; nothing is curated.
 */
export async function getRecentCompetitions(
  limit = 12,
): Promise<(WcaCompetition & { results_posted_at?: string })[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await wcaFetch<
    Array<WcaCompetition & { results_posted_at?: string | null }>
  >(`/competitions?end=${today}&sort=-end_date&per_page=80`);
  return (data ?? [])
    .filter((c) => Boolean(c.results_posted_at))
    .sort((a, b) => String(b.results_posted_at).localeCompare(String(a.results_posted_at)))
    .slice(0, limit)
    .map(trimCompetition);
}

export type CompSearch = {
  q?: string;
  /** ISO-2 country code, e.g. "US" */
  country?: string;
  /** competitions starting on/after this YYYY-MM-DD */
  start?: string;
  /** competitions ending on/before this YYYY-MM-DD */
  end?: string;
  page?: number;
  perPage?: number;
};

/**
 * Browse/search the WCA competition index. Supports full-text `q`, country and
 * date filters, and pagination (so the client can scroll to load more), all
 * most-recent first.
 */
export async function searchCompetitions(
  opts: CompSearch = {},
): Promise<{ competitions: WcaCompetition[]; hasMore: boolean }> {
  const perPage = opts.perPage ?? 25;
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.country) params.set("country_iso2", opts.country);
  if (opts.start) params.set("start", opts.start);
  // Only surface competitions that have already happened: a future competition
  // has no scrambles yet. Cap the end-date filter at today (UTC), honouring a
  // tighter caller end (e.g. a past-year filter) when given.
  const today = new Date().toISOString().slice(0, 10);
  params.set("end", opts.end && opts.end < today ? opts.end : today);
  params.set("sort", "-start_date");
  params.set("per_page", String(perPage));
  params.set("page", String(Math.max(1, opts.page ?? 1)));
  const { data } = await wcaFetch<
    Array<WcaCompetition & { results_posted_at?: string | null }>
  >(`/competitions?${params.toString()}`);
  const raw = data ?? [];
  // results_posted_at is set once the WCA has processed the competition and its
  // results + scrambles are public — the signal that it can actually be
  // simulated. Unprocessed comps (scrambles not posted yet) are hidden until
  // then, and reappear automatically once the WCA posts them.
  const competitions = raw
    .filter((c) => Boolean(c.results_posted_at))
    .map((c) => trimCompetition({ ...c, results_posted_at: null }));
  // hasMore reflects the raw page (pre-filter) so scroll-to-load-more keeps
  // paging even when a page loses a comp or two to the filter.
  return { competitions, hasMore: raw.length === perPage };
}

export type RoundScrambleSet = {
  available: boolean;
  reason?: string;
  roundTypeId?: string;
  roundName?: string;
  groupId?: string;
  /** group ids the user can choose from for this round (each format-complete) */
  groups?: string[];
  /** ordered by scramble_num, is_extra excluded */
  scrambles?: string[];
};

/** One solvable round of a competition (ordered, format-complete per group). */
export type Round = {
  roundTypeId: string;
  roundName: string;
  order: number;
  /** default group (A when present, else the first) */
  groupId: string;
  /** every group with a full scramble set for this round, sorted */
  groups: string[];
  /** default group's scrambles (kept for callers that don't pick a group) */
  scrambles: string[];
  /** scrambles for each qualifying group, keyed by group id */
  scramblesByGroup: Record<string, string[]>;
};

export type Rounds = {
  available: boolean;
  reason?: string;
  /** every solvable round of the event, in competition order (first → final) */
  rounds: Round[];
};

/** Scramble groups in competition order: A..Z, then AA, AB, … */
function byGroup(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}

/**
 * All solvable rounds of a competition for one event.
 *
 * The scrambles endpoint returns ONE flat list for the whole comp, so we:
 *   1. filter to the event,
 *   2. split into rounds by round_type_id,
 *   3. within each round take Group A (or the first group present),
 *   4. drop is_extra backups, order by scramble_num,
 *   5. keep rounds with a full solve count for the event's format
 *      (5 for average-of-5, 3 for mean-of-3),
 *   6. sort rounds by their real competition order.
 *
 * Cached once per (competition, event).
 */
export async function getEventRounds(
  id: string,
  eventId: string,
): Promise<Rounds> {
  const def = getEventDef(eventId);
  if (!def) {
    return { available: false, reason: "Unsupported event", rounds: [] };
  }
  const { data } = await wcaFetch<WcaScramble[]>(
    `/competitions/${encodeURIComponent(id)}/scrambles`,
  );

  if (!data || !Array.isArray(data) || data.length === 0) {
    return { available: false, reason: "Scrambles not available", rounds: [] };
  }

  const forEvent = data.filter((s) => s.event_id === eventId);
  if (forEvent.length === 0) {
    return {
      available: false,
      reason: `No ${def.name} scrambles for this competition`,
      rounds: [],
    };
  }

  const byRound = new Map<string, WcaScramble[]>();
  for (const s of forEvent) {
    const list = byRound.get(s.round_type_id) ?? [];
    list.push(s);
    byRound.set(s.round_type_id, list);
  }

  const need = minScrambles(eventId);
  const rounds: Round[] = [];
  for (const [code, roundScrambles] of byRound) {
    // Build every group's ordered scramble set; keep only the groups that have
    // a full solve count for the format (skips cutoff/partial/extra-only sets).
    const scramblesByGroup: Record<string, string[]> = {};
    const allGroups = [...new Set(roundScrambles.map((s) => s.group_id))].sort(byGroup);
    for (const g of allGroups) {
      const scr = roundScrambles
        .filter((s) => s.group_id === g && !s.is_extra)
        .sort((a, b) => a.scramble_num - b.scramble_num)
        .map((s) => s.scramble);
      if (scr.length >= need) scramblesByGroup[g] = scr;
    }
    const groups = Object.keys(scramblesByGroup).sort(byGroup);
    if (groups.length === 0) continue;
    // Default to Group "A" when present, otherwise the first group.
    const groupId = groups.includes("A") ? "A" : groups[0];
    rounds.push({
      roundTypeId: code,
      roundName: roundName(code),
      order: roundOrder(code),
      groupId,
      groups,
      scrambles: scramblesByGroup[groupId],
      scramblesByGroup,
    });
  }

  if (rounds.length === 0) {
    return {
      available: false,
      reason: `No full ${def.name} rounds for this competition`,
      rounds: [],
    };
  }

  rounds.sort((a, b) => a.order - b.order || a.roundTypeId.localeCompare(b.roundTypeId));
  return { available: true, rounds };
}

/**
 * One round's scramble set. `roundTypeId` omitted → the first round.
 * `groupId` omitted (or not present in this round) → the default group.
 */
export async function getEventRoundScrambles(
  id: string,
  eventId: string,
  roundTypeId?: string,
  groupId?: string,
): Promise<RoundScrambleSet> {
  const { available, reason, rounds } = await getEventRounds(id, eventId);
  if (!available) return { available: false, reason };
  const round = roundTypeId
    ? rounds.find((r) => r.roundTypeId === roundTypeId)
    : rounds[0];
  if (!round) {
    return { available: false, reason: "That round isn't available." };
  }
  // An explicitly requested group that this round doesn't have is an error,
  // never a silent switch to another group's scrambles.
  if (groupId && !round.scramblesByGroup[groupId]) {
    return { available: false, reason: `Group ${groupId} isn't available for this round.` };
  }
  const gid = groupId ?? round.groupId;
  return {
    available: true,
    roundTypeId: round.roundTypeId,
    roundName: round.roundName,
    groupId: gid,
    groups: round.groups,
    scrambles: round.scramblesByGroup[gid],
  };
}

/**
 * Which supported events this competition held with a full scramble set, in
 * canonical event order. Drives the event picker. One scrambles fetch (cached),
 * intersected with the events we support and that have enough scrambles.
 */
export type CompetitionEvent = { id: string; name: string };

export async function getCompetitionEvents(
  id: string,
): Promise<CompetitionEvent[]> {
  const { data } = await wcaFetch<WcaScramble[]>(
    `/competitions/${encodeURIComponent(id)}/scrambles`,
  );
  if (!data || !Array.isArray(data) || data.length === 0) return [];

  // Count non-extra Group-A-ish scrambles per (event, round) is overkill here;
  // an event qualifies if any round has >= its solve count of real scrambles.
  const present = new Set<string>();
  const byEventRound = new Map<string, WcaScramble[]>();
  for (const s of data) {
    if (s.is_extra) continue;
    const key = `${s.event_id}|${s.round_type_id}`;
    const list = byEventRound.get(key) ?? [];
    list.push(s);
    byEventRound.set(key, list);
  }
  for (const [key, list] of byEventRound) {
    const eventId = key.split("|")[0];
    const groups = [...new Set(list.map((s) => s.group_id))].sort();
    const groupId = groups.includes("A") ? "A" : groups[0];
    const count = list.filter((s) => s.group_id === groupId).length;
    if (count >= minScrambles(eventId)) present.add(eventId);
  }

  return SUPPORTED_EVENTS.filter((e) => present.has(e.id)).map((e) => ({
    id: e.id,
    name: e.name,
  }));
}

/**
 * A short summary for a competition card: the 3x3 champion (winner of the
 * final round) and how many supported events it ran. Two cached WCA calls.
 */
export type CompetitionHighlight = {
  winnerName: string | null;
  eventCount: number;
};

export async function getCompetitionHighlight(
  id: string,
): Promise<CompetitionHighlight> {
  const [events, rounds] = await Promise.all([
    getCompetitionEvents(id),
    // Shares the per-event cache with the 3x3 rankings.
    getEventResults(id, "333").catch(() => [] as CompactRound[]),
  ]);

  // The champion is the winner of the LAST round (highest round order).
  const final = rounds[rounds.length - 1];
  const winnerName = final?.rows.find((r) => r.pos === 1)?.name ?? null;

  return { winnerName, eventCount: events.length };
}

// ---------- WCA persons (real personal records) ----------

/** WCA ID format: 4 digits, 4 uppercase letters, 2 digits — e.g. 2016PARK01. */
const WCA_ID_RE = /^\d{4}[A-Z]{4}\d{2}$/;

export function isValidWcaId(wcaId: string): boolean {
  return WCA_ID_RE.test(wcaId);
}

type WcaPersonRecord = { single?: { best?: number }; average?: { best?: number } };
type WcaPersonPayload = {
  person?: { name?: string; wca_id?: string };
  personal_records?: Record<string, WcaPersonRecord>;
};

export type WcaPerson = {
  name: string;
  /** per-event official bests in centiseconds; null when the record is absent */
  records: Record<string, { single: number | null; average: number | null }>;
};

/**
 * A person's official WCA personal records. Maps `personal_records` to
 * `{ [eventId]: { single, average } }` in centiseconds (the `best` field).
 * A missing person is a 404 -> WcaError (the caller turns it into a clean
 * client-facing error rather than a 5xx).
 */
export async function getWcaPerson(wcaId: string): Promise<WcaPerson> {
  const { data } = await wcaFetch<WcaPersonPayload>(
    `/persons/${encodeURIComponent(wcaId)}`,
  );
  if (!data || !data.person) {
    throw new WcaError("WCA ID not found", 404);
  }
  const records: WcaPerson["records"] = {};
  const pr = data.personal_records ?? {};
  for (const [eventId, rec] of Object.entries(pr)) {
    records[eventId] = {
      single: typeof rec.single?.best === "number" ? rec.single.best : null,
      average: typeof rec.average?.best === "number" ? rec.average.best : null,
    };
  }
  return { name: data.person.name ?? wcaId, records };
}

/**
 * One official competitor of a round, in official order. `averageCs` is null
 * without a valid average (a DNF average, or stopped by a cutoff); `bestCs` is
 * null without a valid single. `pos` is the WCA position (ties share it).
 */
export type Competitor = {
  name: string;
  pos: number;
  averageCs: number | null;
  bestCs: number | null;
};

/** The round that came after this one, and how many competitors reached it. */
export type NextRoundInfo = {
  roundTypeId: string;
  roundName: string;
  advancedCount: number;
  /** whether that round's scrambles exist so it can actually be simulated.
   *  Results and scrambles are uploaded independently on the WCA, so a round
   *  can have official results but no full scramble set. Set by the endpoint. */
  solvable?: boolean;
};

export type RankingData = {
  roundTypeId: string;
  roundName: string;
  /** everyone who competed in the round (DNS-only rows excluded) */
  totalCompetitors: number;
  /** every competitor in official order, including no-average rows */
  competitors: Competitor[];
  fastestAverage: number | null;
  /** null when this is the final round */
  nextRound: NextRoundInfo | null;
};

type EventResultsPayload = {
  rounds?: { roundTypeId: string; results?: WcaResult[] }[];
};

/** The compact per-event results kept in cache: just what ranking needs. */
type CompactRound = {
  roundTypeId: string;
  rows: { name: string; pos: number; average: number; best: number; who: string }[];
};

/**
 * Every round's results for one event, from the WCA's per-event endpoint
 * (about a fifth of the bytes of the whole competition's results; the old
 * `?event_id=` filter is ignored upstream). Cached compactly, so all the
 * rounds of an event share one download.
 */
function getEventResults(id: string, eventId: string): Promise<CompactRound[]> {
  return withCache(`event-results:${id}:${eventId}`, TTL.SHORT_MS, async () => {
    const { data } = await wcaFetch<EventResultsPayload>(
      `/competitions/${encodeURIComponent(id)}/results/${encodeURIComponent(eventId)}`,
    );
    return (data?.rounds ?? [])
      .map((r) => ({
        roundTypeId: r.roundTypeId,
        rows: (r.results ?? [])
          // A row with no attempt at all (DNS only) didn't compete.
          .filter((x) => x.best > 0 || x.best === -1)
          .map((x) => ({
            name: x.name,
            pos: x.pos,
            average: x.average,
            best: x.best,
            who: x.wca_id ?? `name:${x.name}`,
          })),
      }))
      .filter((r) => r.rows.length > 0)
      .sort(
        (a, b) =>
          roundOrder(a.roundTypeId) - roundOrder(b.roundTypeId) ||
          a.roundTypeId.localeCompare(b.roundTypeId),
      );
  });
}

/**
 * Real competitors for one round, in official WCA order (by position, which
 * already applies the best-single tie-break and puts no-average rows last),
 * plus how many advanced to the next round.
 *
 * Advancement: the next round's row count undercounts the cut (qualifiers
 * can decline), so the cut is the worst position among this round's
 * competitors who actually appear in the next round.
 */
export async function getEventRanking(
  id: string,
  eventId: string,
  roundTypeId: string,
): Promise<RankingData> {
  const rounds = await getEventResults(id, eventId);
  const idx = rounds.findIndex((r) => r.roundTypeId === roundTypeId);
  const rows = idx >= 0 ? rounds[idx].rows : [];

  const competitors: Competitor[] = rows
    .map((r) => ({
      name: r.name,
      pos: r.pos,
      averageCs: r.average > 0 ? r.average : null,
      bestCs: r.best > 0 ? r.best : null,
    }))
    .sort((a, b) => a.pos - b.pos);

  const next = idx >= 0 ? rounds[idx + 1] : undefined;
  let nextRound: NextRoundInfo | null = null;
  if (next) {
    const reached = new Set(next.rows.map((r) => r.who));
    let cut = 0;
    for (const r of rows) if (reached.has(r.who)) cut = Math.max(cut, r.pos);
    nextRound = {
      roundTypeId: next.roundTypeId,
      roundName: roundName(next.roundTypeId),
      advancedCount: cut || next.rows.length,
    };
  }

  const fastest = competitors.find((c) => c.averageCs !== null);
  return {
    roundTypeId,
    roundName: roundName(roundTypeId),
    totalCompetitors: competitors.length,
    competitors,
    fastestAverage: fastest?.averageCs ?? null,
    nextRound,
  };
}

// ---------- cutoffs (combined rounds) ----------

/**
 * A combined round's cutoff: within the first `numberOfAttempts`, one
 * attempt must be strictly under `attemptResultCs` to go on to the full round.
 */
export type Cutoff = { numberOfAttempts: number; attemptResultCs: number };

/** Round codes that can carry a cutoff ("combined" rounds). */
const COMBINED = new Set(["c", "d", "e", "g", "h"]);

type WcifPublic = {
  events?: {
    id: string;
    rounds?: { id: string; cutoff?: { numberOfAttempts: number; attemptResult: number } | null }[];
  }[];
};

/**
 * The cutoff for one round, from the competition's public WCIF. Only
 * combined rounds have cutoffs, so only they pay for the WCIF (~5 MB, mostly
 * the competitor list); what's cached is just the tiny per-round cutoffs.
 */
export async function getRoundCutoff(
  id: string,
  eventId: string,
  roundTypeId: string,
): Promise<Cutoff | null> {
  if (!COMBINED.has(roundTypeId)) return null;
  const byEvent = await withCache(`cutoffs:${id}`, TTL.LONG_MS, async () => {
    const { data } = await wcaFetch<WcifPublic>(
      `/competitions/${encodeURIComponent(id)}/wcif/public`,
    );
    const out: Record<string, (Cutoff | null)[]> = {};
    for (const e of data?.events ?? []) {
      out[e.id] = (e.rounds ?? []).map((r) =>
        r.cutoff && r.cutoff.attemptResult > 0
          ? { numberOfAttempts: r.cutoff.numberOfAttempts, attemptResultCs: r.cutoff.attemptResult }
          : null,
      );
    }
    return out;
  });
  const rounds = byEvent[eventId] ?? [];
  // WCIF numbers rounds r1..rN: finals are the last; others by their order.
  const order = roundOrder(roundTypeId);
  const idx = roundTypeId === "c" ? rounds.length - 1 : order - 1;
  return idx >= 0 ? (rounds[idx] ?? null) : null;
}
