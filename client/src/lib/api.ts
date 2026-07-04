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

export function searchCompetitions(query: string): Promise<{ competitions: Competition[] }> {
  return getJson(`/api/competitions?q=${encodeURIComponent(query)}`);
}

/** The solvable 3x3 rounds of a competition (first → final). */
export function getRounds(id: string): Promise<{
  competition: Competition;
  available: boolean;
  reason?: string;
  rounds: RoundMeta[];
}> {
  return getJson(`/api/competitions/${encodeURIComponent(id)}/rounds`);
}

/** One round's scrambles. Omit roundTypeId for the first round. */
export function getRound(
  id: string,
  roundTypeId?: string,
): Promise<{ competition: Competition; round: RoundScrambleSet }> {
  const q = roundTypeId ? `?roundTypeId=${encodeURIComponent(roundTypeId)}` : "";
  return getJson(`/api/competitions/${encodeURIComponent(id)}/round${q}`);
}

export function getRanking(
  id: string,
  roundTypeId: string,
): Promise<{ ranking: RankingData }> {
  return getJson(
    `/api/competitions/${encodeURIComponent(id)}/ranking?roundTypeId=${encodeURIComponent(roundTypeId)}`,
  );
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
