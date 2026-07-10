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

export type RoundScrambleSet = {
  available: boolean;
  reason?: string;
  roundTypeId?: string;
  roundName?: string;
  groupId?: string;
  scrambles?: string[];
};

/** One selectable round of a competition. */
export type RoundMeta = { roundTypeId: string; roundName: string };

export type Competitor = { name: string; averageCs: number };

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
  totalCompetitors: number;
  /** valid Ao5 competitors ascending by average (DNFs excluded, still counted) */
  competitors: Competitor[];
  fastestAverage: number | null;
  /** null when this is the final round */
  nextRound: NextRoundInfo | null;
};

/** The signed-in session token, if any — sent so Pro users clear gating. */
function authHeaders(): Record<string, string> {
  const token = store.get("cb_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
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
): Promise<{ competitions: Competition[]; page: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.country) params.set("country", opts.country);
  if (opts.start) params.set("start", opts.start);
  if (opts.end) params.set("end", opts.end);
  if (opts.page) params.set("page", String(opts.page));
  const qs = params.toString();
  return getJson(`/api/competitions${qs ? `?${qs}` : ""}`);
}

/** One selectable event id + name that a competition held (already filtered to solvable). */
export type EventMeta = { id: string; name: string };

/** The solvable events a competition held. */
export function getEvents(id: string): Promise<{
  competition: Competition;
  events: EventMeta[];
}> {
  return getJson(`/api/competitions/${encodeURIComponent(id)}/events`);
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
  return getJson(
    `/api/competitions/${encodeURIComponent(id)}/rounds?event=${encodeURIComponent(event)}`,
  );
}

/** One round's scrambles. Omit roundTypeId for the first round. Defaults to 3x3. */
export function getRound(
  id: string,
  roundTypeId?: string,
  event = "333",
): Promise<{ competition: Competition; event: string; round: RoundScrambleSet }> {
  const params = new URLSearchParams({ event });
  if (roundTypeId) params.set("roundTypeId", roundTypeId);
  return getJson(
    `/api/competitions/${encodeURIComponent(id)}/round?${params.toString()}`,
  );
}

export function getRanking(
  id: string,
  roundTypeId: string,
  event = "333",
): Promise<{ ranking: RankingData }> {
  const params = new URLSearchParams({ event, roundTypeId });
  return getJson(
    `/api/competitions/${encodeURIComponent(id)}/ranking?${params.toString()}`,
  );
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
  return getJson(`/api/competitions/${encodeURIComponent(id)}/highlight`);
}

/** A person's official WCA personal records (single/average per event, in cs). */
export type WcaPerson = {
  name: string;
  records: Record<string, { single: number | null; average: number | null }>;
};

/** Look up a competitor's official WCA records by WCA ID. Public — no auth. */
export function getWcaPerson(wcaId: string): Promise<WcaPerson> {
  return getJson(`/api/wca/person/${encodeURIComponent(wcaId)}`);
}

/** Live counter of the free "first 100" Pro-month spots. Public — no auth. */
export function getPromo(): Promise<{
  active: boolean;
  endsAt: number;
  claimed: number;
}> {
  return getJson(`/api/promo`);
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
