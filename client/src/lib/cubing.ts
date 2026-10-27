/**
 * Pure cubing math. No React, no I/O — easy to reason about and to test, and
 * this is the code cubers will scrutinize hardest, so it stays isolated.
 *
 * Internally we keep durations in MILLISECONDS for timer precision, and only
 * convert to centiseconds (WCA's unit) at the moment we compare against
 * official results, so the comparison is apples-to-apples.
 */

import type { EventFormat } from "./events.ts";

export type StageKey = "cross" | "f2l" | "oll" | "pll";

export const STAGE_ORDER: StageKey[] = ["cross", "f2l", "oll", "pll"];

export const STAGE_LABEL: Record<StageKey, string> = {
  cross: "Cross",
  f2l: "F2L",
  oll: "OLL",
  pll: "PLL",
};

export type Solve = {
  /** stage durations in ms, in solve order */
  stages: Record<StageKey, number>;
  /** total solve time in ms (== sum of stages) */
  totalMs: number;
};

/**
 * One competition attempt. `plus2` is the WCA +2 penalty (from inspection
 * overrun or marked manually). The penalty is part of the attempt's official
 * time: it is added BEFORE choosing best/worst and before averaging, never
 * after. `dnf` marks the attempt Did Not Finish (mis-tap, pop, wrong stop) —
 * a DNF has no time.
 */
export type Attempt = {
  /** stopwatch time in ms, penalty not included */
  rawMs: number;
  plus2: boolean;
  dnf?: boolean;
};

/** The attempt's official time in ms: raw + 2.000s if penalized. */
export function attemptEffectiveMs(a: Attempt): number {
  return a.rawMs + (a.plus2 ? 2000 : 0);
}

/**
 * The attempt's OFFICIAL result in centiseconds, the way the WCA records it:
 * truncated to the hundredth (Regulation 9f1), or to the whole second at
 * 10:00.00 and over (9f2). Everything official — best/worst selection, the
 * average, ranking — is computed from these values. (+2 is exactly +200 cs,
 * so it can be added before the 10-minute step.)
 */
export function attemptCs(a: Attempt): number {
  const cs = Math.floor(a.rawMs / 10) + (a.plus2 ? 200 : 0);
  return cs >= 60_000 ? Math.floor(cs / 100) * 100 : cs;
}

/** Round a mean of centiseconds the WCA way: to the hundredth, or to the
 *  second (.50 up) at 10 minutes and over (Regulation 9f2). */
export function roundAverageCs(meanCs: number): number {
  return meanCs >= 60_000 ? Math.round(meanCs / 100) * 100 : Math.round(meanCs);
}

/**
 * WCA display convention: a penalized result shows the FINAL time with a
 * trailing "+" — a 12.34 solve with +2 renders "14.34+". A DNF shows "DNF".
 */
export function formatAttempt(a: Attempt): string {
  if (a.dnf) return "DNF";
  return formatCentiseconds(attemptCs(a)) + (a.plus2 ? "+" : "");
}

/**
 * WCA Ao5 over attempts, DNF-aware:
 *   - a single DNF is the worst attempt (dropped),
 *   - two or more DNFs make the average itself DNF (returns null),
 *   - otherwise: quantize to cs, drop one best and one worst, mean the
 *     middle three, round once.
 */
export function wcaAo5FromAttempts(attempts: Attempt[]): number | null {
  if (attempts.length !== 5) {
    throw new Error(`Ao5 needs exactly 5 attempts, got ${attempts.length}`);
  }
  const dnfCount = attempts.filter((a) => a.dnf).length;
  if (dnfCount >= 2) return null;
  const cs = attempts
    .filter((a) => !a.dnf)
    .map(attemptCs)
    .sort((a, b) => a - b);
  // one DNF: it IS the worst (already excluded) -> drop only the best of the
  // four real times; zero DNFs: drop best and worst of five.
  const middleThree = dnfCount === 1 ? cs.slice(1) : cs.slice(1, 4);
  return roundAverageCs(
    middleThree.reduce((sum, t) => sum + t, 0) / middleThree.length,
  );
}

/**
 * Format-aware WCA average over attempts, DNF-aware. Delegates to the existing
 * Ao5 logic for "ao5" (5 attempts) and applies the mean-of-3 rule for "mo3":
 *   - "ao5": drop best+worst, mean the middle three (single DNF is the worst
 *     and is dropped; two+ DNFs make the average DNF). Unchanged from before.
 *   - "mo3": mean of ALL three effective times, no dropping; ANY DNF makes the
 *     average DNF (returns null).
 * Attempts are quantized to centiseconds first (+2 already included), so the
 * average is provably consistent with the displayed attempts.
 */
export function wcaAverageFromAttempts(
  attempts: Attempt[],
  format: EventFormat,
): number | null {
  if (format === "ao5") return wcaAo5FromAttempts(attempts);
  // mean of 3
  if (attempts.length !== 3) {
    throw new Error(`Mo3 needs exactly 3 attempts, got ${attempts.length}`);
  }
  if (attempts.some((a) => a.dnf)) return null; // any DNF -> DNF mean
  const cs = attempts.map(attemptCs);
  return roundAverageCs(cs.reduce((sum, t) => sum + t, 0) / cs.length);
}

/**
 * WCA-faithful average in centiseconds from already-quantized attempt times,
 * format-aware. "ao5" drops best+worst then means the middle three; "mo3"
 * means all three. No DNF handling here (callers pass valid times only) — for
 * DNF-aware averaging use `wcaAverageFromAttempts`.
 */
export function wcaAverageCs(attemptsCs: number[], format: EventFormat): number {
  if (format === "ao5") return wcaAo5Cs(attemptsCs);
  if (attemptsCs.length !== 3) {
    throw new Error(`Mo3 needs exactly 3 times, got ${attemptsCs.length}`);
  }
  return Math.round(attemptsCs.reduce((sum, t) => sum + t, 0) / attemptsCs.length);
}

/**
 * WCA average of 5: drop the single best AND single worst attempt, take the
 * mean of the middle three. Sorting and slicing indices 1..4 removes exactly
 * one best and one worst even when times are tied (a plain "remove min/max by
 * value" would wrongly drop duplicates).
 *
 * Returns the mean in ms (not yet rounded); callers round when displaying.
 * Requires exactly 5 times — v1 has no DNFs, so no DNF handling here.
 */
export function wcaAo5Ms(totalsMs: number[]): number {
  if (totalsMs.length !== 5) {
    throw new Error(`Ao5 needs exactly 5 times, got ${totalsMs.length}`);
  }
  const sorted = [...totalsMs].sort((a, b) => a - b);
  const middleThree = sorted.slice(1, 4); // drops sorted[0] (best) and sorted[4] (worst)
  return middleThree.reduce((sum, t) => sum + t, 0) / middleThree.length;
}

/**
 * WCA-faithful Ao5 in centiseconds: attempts are already quantized to cs
 * (like every official result), best/worst are chosen and the middle three
 * averaged in cs, and the mean is rounded to the nearest cs — the same
 * pipeline that produced the official averages we rank against. This keeps
 * the displayed average provably consistent with the displayed attempts.
 */
export function wcaAo5Cs(attemptsCs: number[]): number {
  return Math.round(wcaAo5Ms(attemptsCs)); // same drop rule, cs domain
}

/** ms -> centiseconds, rounded to nearest (WCA records/averages to centiseconds). */
export function msToCentiseconds(ms: number): number {
  return Math.round(ms / 10);
}

/**
 * Slowest stage across all solves: sum each stage over the 5 solves, then
 * report the stage with the largest share of total time. Simple and honest —
 * "where is your time actually going."
 */
export type StageBreakdown = {
  totals: Record<StageKey, number>; // summed ms per stage
  grandTotalMs: number;
  slowest: StageKey;
  slowestShare: number; // 0..1
};

export function stageBreakdown(solves: Solve[]): StageBreakdown {
  const totals: Record<StageKey, number> = { cross: 0, f2l: 0, oll: 0, pll: 0 };
  for (const solve of solves) {
    for (const key of STAGE_ORDER) totals[key] += solve.stages[key];
  }
  const grandTotalMs = STAGE_ORDER.reduce((sum, k) => sum + totals[k], 0);
  const slowest = STAGE_ORDER.reduce((max, k) =>
    totals[k] > totals[max] ? k : max,
  );
  const slowestShare = grandTotalMs > 0 ? totals[slowest] / grandTotalMs : 0;
  return { totals, grandTotalMs, slowest, slowestShare };
}

/**
 * A combined round's cutoff: did the competitor miss it? True once the first
 * `numberOfAttempts` attempts are in and none is strictly under the cutoff
 * (Regulation 9g) — the round ends there, with no average.
 */
export function missedCutoff(
  attempts: Attempt[],
  cutoff: { numberOfAttempts: number; attemptResultCs: number },
): boolean {
  if (attempts.length < cutoff.numberOfAttempts) return false;
  return !attempts
    .slice(0, cutoff.numberOfAttempts)
    .some((a) => !a.dnf && attemptCs(a) < cutoff.attemptResultCs);
}

/** The best valid single among attempts, in cs (null if every one is a DNF). */
export function bestSingleCs(attempts: Attempt[]): number | null {
  const valid = attempts.filter((a) => !a.dnf).map(attemptCs);
  return valid.length ? Math.min(...valid) : null;
}

/**
 * Where the user would place among a round's official competitors, by WCA
 * ranking rules: by average; equal averages broken by best single
 * (Regulation 9f14); no valid average ranks after every valid average, by best
 * single; an identical (average, best) pair shares the position (9f15), so
 * only STRICTLY better competitors count. The user joins the field, so the
 * total is one more than the official field.
 */
export function placeResult(
  user: { averageCs: number | null; bestCs: number | null },
  competitors: { averageCs: number | null; bestCs: number | null }[],
): { placement: number; total: number } {
  const ua = user.averageCs ?? Infinity;
  const ub = user.bestCs ?? Infinity;
  let better = 0;
  for (const c of competitors) {
    const ca = c.averageCs ?? Infinity;
    const cb = c.bestCs ?? Infinity;
    if (ca < ua || (ca === ua && cb < ub)) better++;
  }
  return { placement: better + 1, total: competitors.length + 1 };
}

/**
 * Placement against real competitors, WCA-ordered: count how many valid
 * averages are strictly faster, +1. `averagesAsc` are centiseconds (ascending,
 * DNFs already excluded); `total` is everyone in the round including DNFs, who
 * sort below any real average. Ties: the user places just behind equal times.
 */
export function placeAverage(
  userAvgCs: number,
  averagesAsc: number[],
  total: number,
): { placement: number; total: number } {
  let better = 0;
  for (const a of averagesAsc) {
    if (a < userAvgCs) better++;
    else break; // ascending -> the rest are >= user
  }
  return { placement: better + 1, total };
}

// ---------- formatting ----------

/** ms -> "SS.xx" or "M:SS.xx", rounded to centiseconds. */
export function formatMs(ms: number): string {
  return formatCentiseconds(msToCentiseconds(ms));
}

/** centiseconds -> "SS.xx" or "M:SS.xx". */
export function formatCentiseconds(cs: number): string {
  const totalSeconds = cs / 100;
  if (totalSeconds >= 60) {
    const m = Math.floor(totalSeconds / 60);
    const s = (totalSeconds % 60).toFixed(2).padStart(5, "0");
    return `${m}:${s}`;
  }
  return totalSeconds.toFixed(2);
}

/**
 * WCA advancement: the top `advancedCount` finishers of a round move on, so a
 * placement makes the cut iff it's within that count. (placement is 1-based.)
 */
export function madeTheCut(placement: number, advancedCount: number): boolean {
  return placement <= advancedCount;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
