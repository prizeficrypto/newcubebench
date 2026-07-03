import { roundName, roundOrder } from "./roundTypes.ts";

const WCA_BASE = "https://www.worldcubeassociation.org/api/v0";
const EVENT_333 = "333";

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

export async function getCompetition(id: string): Promise<WcaCompetition> {
  const { status, data } = await wcaFetch<WcaCompetition>(
    `/competitions/${encodeURIComponent(id)}`,
  );
  if (!data) throw new WcaError(`Competition "${id}" not found`, status || 404);
  return data;
}

export async function searchCompetitions(query: string): Promise<WcaCompetition[]> {
  const q = query.trim();
  // The WCA competitions index supports full-text `q`, sorted most-recent first.
  const path = q
    ? `/competitions?q=${encodeURIComponent(q)}&sort=-start_date&per_page=25`
    : `/competitions?sort=-start_date&per_page=25`;
  const { data } = await wcaFetch<WcaCompetition[]>(path);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    country_iso2: c.country_iso2,
    start_date: c.start_date,
    end_date: c.end_date,
  }));
}

export type RoundScrambleSet = {
  available: boolean;
  reason?: string;
  roundTypeId?: string;
  roundName?: string;
  groupId?: string;
  /** ordered by scramble_num, is_extra excluded */
  scrambles?: string[];
};

/** One solvable 3x3 round of a competition (Group A, ordered, ao5-complete). */
export type Round333 = {
  roundTypeId: string;
  roundName: string;
  order: number;
  groupId: string;
  scrambles: string[];
};

export type Rounds333 = {
  available: boolean;
  reason?: string;
  /** every solvable 3x3 round, in competition order (first → final) */
  rounds: Round333[];
};

/**
 * All solvable 3x3 rounds of a competition.
 *
 * The scrambles endpoint returns ONE flat list for the whole comp, so we:
 *   1. filter to event 333,
 *   2. split into rounds by round_type_id,
 *   3. within each round take Group A (or the first group present),
 *   4. drop is_extra backups, order by scramble_num,
 *   5. keep rounds that have a full average-of-5 (≥5 scrambles),
 *   6. sort rounds by their real competition order.
 *
 * This is the single WCA fetch; the round list and any individual round are
 * both derived from it, so it's cached once per competition.
 */
export async function get333Rounds(id: string): Promise<Rounds333> {
  const { data } = await wcaFetch<WcaScramble[]>(
    `/competitions/${encodeURIComponent(id)}/scrambles`,
  );

  if (!data || !Array.isArray(data) || data.length === 0) {
    return { available: false, reason: "Scrambles not available", rounds: [] };
  }

  const threes = data.filter((s) => s.event_id === EVENT_333);
  if (threes.length === 0) {
    return {
      available: false,
      reason: "No 3x3 scrambles for this competition",
      rounds: [],
    };
  }

  const byRound = new Map<string, WcaScramble[]>();
  for (const s of threes) {
    const list = byRound.get(s.round_type_id) ?? [];
    list.push(s);
    byRound.set(s.round_type_id, list);
  }

  const rounds: Round333[] = [];
  for (const [code, roundScrambles] of byRound) {
    // Prefer Group "A"; otherwise the first group present.
    const groups = [...new Set(roundScrambles.map((s) => s.group_id))].sort();
    const groupId = groups.includes("A") ? "A" : groups[0];
    const scrambles = roundScrambles
      .filter((s) => s.group_id === groupId && !s.is_extra)
      .sort((a, b) => a.scramble_num - b.scramble_num)
      .map((s) => s.scramble);
    // An average-of-5 round needs 5 scrambles; skip cutoff/partial rounds.
    if (scrambles.length < 5) continue;
    rounds.push({
      roundTypeId: code,
      roundName: roundName(code),
      order: roundOrder(code),
      groupId,
      scrambles,
    });
  }

  if (rounds.length === 0) {
    return {
      available: false,
      reason: "No full average-of-5 3x3 rounds for this competition",
      rounds: [],
    };
  }

  rounds.sort((a, b) => a.order - b.order || a.roundTypeId.localeCompare(b.roundTypeId));
  return { available: true, rounds };
}

/** One round's scramble set. `roundTypeId` omitted → the first round. */
export async function get333RoundScrambles(
  id: string,
  roundTypeId?: string,
): Promise<RoundScrambleSet> {
  const { available, reason, rounds } = await get333Rounds(id);
  if (!available) return { available: false, reason };
  const round = roundTypeId
    ? rounds.find((r) => r.roundTypeId === roundTypeId)
    : rounds[0];
  if (!round) {
    return { available: false, reason: "That round isn't available." };
  }
  return {
    available: true,
    roundTypeId: round.roundTypeId,
    roundName: round.roundName,
    groupId: round.groupId,
    scrambles: round.scrambles,
  };
}

export type Competitor = { name: string; averageCs: number };

/** The round that came after this one, and how many competitors reached it. */
export type NextRoundInfo = { roundName: string; advancedCount: number };

export type RankingData = {
  roundTypeId: string;
  roundName: string;
  totalCompetitors: number;
  /** valid Ao5 competitors, ascending by average; DNFs excluded from the list
   *  but counted in totalCompetitors (they rank last, WCA-style) */
  competitors: Competitor[];
  fastestAverage: number | null;
  /** null when this is the final round */
  nextRound: NextRoundInfo | null;
};

/**
 * Real competitors for a given 3x3 round, ordered the WCA way: valid averages
 * ascending (with names), DNF/no-average competitors excluded from the list
 * but counted in totalCompetitors. Also reports the next round's size, so the
 * client can say whether the user would have made the cut.
 */
export async function get333Ranking(
  id: string,
  roundTypeId: string,
): Promise<RankingData> {
  const { data } = await wcaFetch<WcaResult[]>(
    `/competitions/${encodeURIComponent(id)}/results?event_id=${EVENT_333}`,
  );
  const all = (data ?? []).filter((r) => r.event_id === EVENT_333);

  // How many competed in each round — the next round's size is how many
  // advanced out of this one.
  const countByRound = new Map<string, number>();
  for (const r of all) {
    countByRound.set(r.round_type_id, (countByRound.get(r.round_type_id) ?? 0) + 1);
  }
  const orderedRounds = [...countByRound.keys()].sort(
    (a, b) => roundOrder(a) - roundOrder(b) || a.localeCompare(b),
  );
  const idx = orderedRounds.indexOf(roundTypeId);
  const nextCode = idx >= 0 ? orderedRounds[idx + 1] : undefined;
  const nextRound: NextRoundInfo | null = nextCode
    ? { roundName: roundName(nextCode), advancedCount: countByRound.get(nextCode) ?? 0 }
    : null;

  const rows = all.filter((r) => r.round_type_id === roundTypeId);
  const competitors: Competitor[] = rows
    .filter((r) => r.average > 0)
    .map((r) => ({ name: r.name, averageCs: r.average }))
    .sort((a, b) => a.averageCs - b.averageCs);

  return {
    roundTypeId,
    roundName: roundName(roundTypeId),
    totalCompetitors: rows.length,
    competitors,
    fastestAverage: competitors.length ? competitors[0].averageCs : null,
    nextRound,
  };
}
