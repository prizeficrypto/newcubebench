/** Thin client for our Express proxy. All WCA access goes through the backend. */
import { store } from "./store.ts";

export type Competition = {
  id: string;
  name: string;
  city?: string;
  country_iso2?: string;
  start_date?: string;
  end_date?: string;
};

/**
 * A WCA cutoff (combined rounds): within the first `numberOfAttempts`, at
 * least one attempt must be strictly under `attemptResultCs` for the
 * competitor to continue to the full round; otherwise their round ends there
 * with no average.
 */
export type Cutoff = { numberOfAttempts: number; attemptResultCs: number };

export type RoundScrambleSet = {
  available: boolean;
  reason?: string;
  roundTypeId?: string;
  roundName?: string;
  groupId?: string;
  /** groups the user can pick from for this round (each format-complete), A..Z then AA.. */
  groups?: string[];
  scrambles?: string[];
  /** the round's cutoff, null when it has none, undefined when unknown */
  cutoff?: Cutoff | null;
};

/** One selectable round of a competition. */
export type RoundMeta = {
  roundTypeId: string;
  roundName: string;
  groups?: string[];
  cutoff?: Cutoff | null;
};

/**
 * One official competitor of a round, in official order. `averageCs` is null
 * when they have no valid average (a DNF average, or stopped by the cutoff);
 * `bestCs` is null when they have no valid single. `pos` is the WCA position
 * (ties share a position).
 */
export type Competitor = {
  name: string;
  pos: number;
  averageCs: number | null;
  bestCs: number | null;
};

export type NextRoundInfo = {
  roundTypeId: string;
  roundName: string;
  advancedCount: number;
  /** whether that round can actually be simulated (its scrambles exist) */
  solvable?: boolean;
};

export type RankingData = {
  roundTypeId: string;
  roundName: string;
  /** everyone who competed in the round (== competitors.length) */
  totalCompetitors: number;
  /** every competitor in official order (by pos), including no-average rows */
  competitors: Competitor[];
  fastestAverage: number | null;
  cutoff?: Cutoff | null;
  /** null when this is the final round */
  nextRound: NextRoundInfo | null;
};

/** The signed-in session token, if any. */
function authHeaders(): Record<string, string> {
  const token = store.get("cb_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * In-memory cache for the immutable competition data (events, rounds,
 * scrambles, rankings): one request per URL per page lifetime, shared by
 * every caller — so prefetching while the user solves makes the results
 * screen instant, and going back never refetches. Failures are not kept.
 */
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
const MEMO_MS = 30 * 60 * 1000;

function cached<T>(url: string, ttlMs = MEMO_MS): Promise<T> {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = getJson<T>(url);
  memo.set(url, { at: Date.now(), p });
  p.catch(() => memo.delete(url));
  return p;
}

/**
 * GET JSON from our API. Public data is fetched WITHOUT the session token:
 * none of it depends on who asks, and a request carrying Authorization can't
 * be served from the CDN cache.
 */
async function getJson<T>(url: string, opts: { auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, {
    headers: opts.auth ? authHeaders() : {},
    signal: opts.signal,
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    let upgrade = false;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
      if (body?.upgrade) upgrade = true;
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(detail) as Error & { upgrade?: boolean; status?: number };
    err.upgrade = upgrade;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function searchCompetitions(
  opts: { q?: string; country?: string; start?: string; end?: string; page?: number } = {},
  signal?: AbortSignal,
): Promise<{ competitions: Competition[]; page: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.country) params.set("country", opts.country);
  if (opts.start) params.set("start", opts.start);
  if (opts.end) params.set("end", opts.end);
  if (opts.page) params.set("page", String(opts.page));
  const qs = params.toString();
  return getJson(`/api/competitions${qs ? `?${qs}` : ""}`, { signal });
}

/**
 * Competitions whose results (and scrambles) the WCA published most recently,
 * newest first — new ones appear here automatically.
 */
export function getRecentCompetitions(): Promise<{
  competitions: (Competition & { results_posted_at?: string })[];
}> {
  return cached(`/api/competitions/recent`, 10 * 60 * 1000);
}

/** One selectable event id + name that a competition held (already filtered to solvable). */
export type EventMeta = { id: string; name: string };

/** The solvable events a competition held. */
export function getEvents(id: string): Promise<{
  competition: Competition;
  events: EventMeta[];
}> {
  return cached(`/api/competitions/${encodeURIComponent(id)}/events`);
}

/** The solvable rounds of a competition for one event (first → final). Defaults to 3x3. */
export function getRounds(
  id: string,
  event = "333",
): Promise<{
  competition: Competition;
  event: string;
  available: boolean;
  reason?: string;
  rounds: RoundMeta[];
}> {
  return cached(
    `/api/competitions/${encodeURIComponent(id)}/rounds?event=${encodeURIComponent(event)}`,
  );
}

/**
 * One round's scrambles. Omit roundTypeId for the first round. Optionally pick
 * a scramble group (A/B/C…); omit for the round's default group. Defaults to 3x3.
 */
export function getRound(
  id: string,
  roundTypeId?: string,
  event = "333",
  group?: string,
): Promise<{ competition: Competition; event: string; round: RoundScrambleSet }> {
  const params = new URLSearchParams({ event });
  if (roundTypeId) params.set("roundTypeId", roundTypeId);
  if (group) params.set("group", group);
  return cached(
    `/api/competitions/${encodeURIComponent(id)}/round?${params.toString()}`,
  );
}

export function getRanking(
  id: string,
  roundTypeId: string,
  event = "333",
): Promise<{ ranking: RankingData }> {
  const params = new URLSearchParams({ event, roundTypeId });
  return cached(
    `/api/competitions/${encodeURIComponent(id)}/ranking?${params.toString()}`,
  );
}

/** A round's cutoff (combined rounds only; null otherwise). */
export function getCutoff(
  id: string,
  roundTypeId: string,
  event = "333",
): Promise<{ cutoff: Cutoff | null }> {
  const params = new URLSearchParams({ event, roundTypeId });
  return cached(`/api/competitions/${encodeURIComponent(id)}/cutoff?${params.toString()}`);
}

/** Start loading a round's ranking early (e.g. while the user solves). */
export function prefetchRanking(id: string, roundTypeId: string, event = "333"): void {
  getRanking(id, roundTypeId, event).catch(() => {});
}

/** Start loading a competition's events early (hover/focus on a card). */
export function prefetchEvents(id: string): void {
  getEvents(id).catch(() => {});
}

/**
 * A featured competition's highlight: the 3x3 champion (null if none) and how
 * many events it held, for the richer info cards on the picker's default view.
 */
export function getHighlight(id: string): Promise<{
  competition: Competition;
  winnerName: string | null;
  eventCount: number;
}> {
  return cached(`/api/competitions/${encodeURIComponent(id)}/highlight`);
}

/** A person's official WCA personal records (single/average per event, in cs). */
export type WcaPerson = {
  name: string;
  records: Record<string, { single: number | null; average: number | null }>;
};

/** Look up a competitor's official WCA records by WCA ID. Public — no auth. */
export function getWcaPerson(wcaId: string): Promise<WcaPerson> {
  return cached(`/api/wca/person/${encodeURIComponent(wcaId)}`);
}

/** Send a bug report or suggestion. Works for guests; auth attaches the user. */
export async function submitFeedback(input: {
  kind: "bug" | "suggestion";
  message: string;
  email?: string;
}): Promise<void> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ...input, path: window.location.pathname }),
  });
  if (!res.ok) {
    let detail = "Something went wrong — please try again.";
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
}

export async function submitEarlyAccess(email: string): Promise<void> {
  const res = await fetch("/api/early-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    let detail = "Something went wrong — please try again.";
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
}
