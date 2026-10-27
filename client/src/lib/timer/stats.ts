import { truncateMs, type Precision } from "./format.ts";
import { type TimerSession, type TimerSolve } from "./model.ts";

/**
 * Practice statistics, matching csTimer's definitions (so numbers agree when
 * someone moves between the two) with WCA rounding:
 *
 *   - A solve's value is its effective time (raw + 2 s for +2) truncated to
 *     the precision; a DNF is +Infinity, worse than any time.
 *   - aoN: sort the last N, trim T from each side, mean the rest. T is
 *     ceil(N × trim%) — at the default 5%: ao5/ao12 → 1, ao25 → 2, ao50 → 3,
 *     ao100 → 5. It's a DNF if more DNFs than T are in the window (a DNF
 *     would survive trimming): ao5/ao12 with 2+ DNFs, ao100 with 6+.
 *   - moN: no trimming; any DNF makes it a DNF.
 *   - Averages/means round to the hundredth (to the second at 10 min and
 *     over, WCA 9f2); at millisecond precision, to the millisecond.
 *   - Session mean excludes DNFs; single best/worst are non-DNF only.
 *
 * Everything returns ms, with `undefined` = not enough solves and
 * `Infinity` = DNF.
 */

export type Indicator = { kind: "ao" | "mo"; n: number };

/** csTimer's default indicator set. */
export const DEFAULT_INDICATORS: Indicator[] = [
  { kind: "mo", n: 3 },
  { kind: "ao", n: 5 },
  { kind: "ao", n: 12 },
  { kind: "ao", n: 100 },
];

export function indicatorKey(i: Indicator): string {
  return `${i.kind}${i.n}`;
}

/** Parse "ao5" / "mo3" (3 ≤ n ≤ 10000); null if malformed. */
export function parseIndicator(key: string): Indicator | null {
  const m = /^(ao|mo)(\d{1,5})$/.exec(key.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[2]);
  if (n < 3 || n > 10000) return null;
  return { kind: m[1] as "ao" | "mo", n };
}

/**
 * A solve's value for statistics (Infinity for a DNF). At hundredths
 * precision this is the WCA's recorded result: truncated to the hundredth,
 * or to the whole second at 10 minutes and over (Regulations 9f1/9f2).
 */
export function solveValue(
  s: Pick<TimerSolve, "ms" | "penalty">,
  precision: Precision = 2,
): number {
  if (s.penalty === -1) return Infinity;
  const ms = s.ms + (s.penalty === 2000 ? 2000 : 0);
  if (precision === 2 && ms >= 600_000) return Math.floor(ms / 1000) * 1000;
  return truncateMs(ms, precision);
}

/** Solves trimmed from EACH side of an average of `n` at `trimPct` percent. */
export function trimCount(n: number, kind: "ao" | "mo", trimPct = 5): number {
  if (kind === "mo") return 0;
  let t = Math.ceil((n * trimPct) / 100);
  // Never trim everything: if both sides would eat the window, back off.
  while (t > 0 && 2 * t >= n) t--;
  return t;
}

/** Round a mean the WCA way (or to the ms at millisecond precision). */
export function roundAverage(mean: number, precision: Precision = 2): number {
  if (precision === 3) return Math.round(mean);
  if (mean >= 600_000) return Math.round(mean / 1000) * 1000;
  return Math.round(mean / 10) * 10;
}

/**
 * Average of an ASCENDING-sorted window (Infinity = DNF, sorted last) with
 * `t` trimmed per side.
 */
function averageOfSorted(sorted: number[], t: number, precision: Precision): number {
  const n = sorted.length;
  let dnfs = 0;
  for (let i = n - 1; i >= 0 && !Number.isFinite(sorted[i]); i--) dnfs++;
  if (dnfs > t) return Infinity;
  let sum = 0;
  for (let i = t; i < n - t; i++) sum += sorted[i];
  return roundAverage(sum / (n - 2 * t), precision);
}

/** Average/mean of an arbitrary list of values (any order). */
export function averageOf(
  values: number[],
  kind: "ao" | "mo",
  trimPct = 5,
  precision: Precision = 2,
): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return averageOfSorted(sorted, trimCount(values.length, kind, trimPct), precision);
}

/** Index of the first element >= v in an ascending array. */
function lowerBound(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Rolling average for every solve: series[i] is the indicator over the window
 * ending at solve i (undefined until N solves exist). Keeps a sorted window
 * so each step is O(N), not O(N log N).
 */
export function rollingSeries(
  values: number[],
  ind: Indicator,
  trimPct = 5,
  precision: Precision = 2,
): (number | undefined)[] {
  const { n } = ind;
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (values.length < n) return out;
  const t = trimCount(n, ind.kind, trimPct);
  const win: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    win.splice(lowerBound(win, v), 0, v);
    if (i >= n) {
      const old = values[i - n];
      const at = lowerBound(win, old);
      win.splice(at, 1);
    }
    if (i >= n - 1) out[i] = averageOfSorted(win, t, precision);
  }
  return out;
}

/** Sample standard deviation (n − 1); undefined for fewer than 2 values. */
export function stdev(values: number[]): number | undefined {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return undefined;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const v = finite.reduce((a, x) => a + (x - mean) ** 2, 0) / (finite.length - 1);
  return Math.sqrt(v);
}

export type IndicatorStat = {
  key: string;
  ind: Indicator;
  /** window ending at the latest solve */
  current: number | undefined;
  /** best window in the session */
  best: number | undefined;
  /** index of the LAST solve of the best window (-1 if none) */
  bestEnd: number;
  /** per-solve rolling value (for the time list and trend chart) */
  series: (number | undefined)[];
};

export type SessionStats = {
  count: number;
  /** solves that aren't DNF */
  nonDnf: number;
  /** best single (non-DNF) and its index */
  best: number | undefined;
  bestIndex: number;
  worst: number | undefined;
  /** mean of non-DNF solves (Infinity if every solve is a DNF) */
  mean: number | undefined;
  /** sample σ of non-DNF solves */
  sd: number | undefined;
  /** sum of raw stopwatch times — "time spent" */
  totalMs: number;
  indicators: IndicatorStat[];
};

export function sessionStats(
  solves: TimerSolve[],
  opts: { indicators?: Indicator[]; trimPct?: number; precision?: Precision } = {},
): SessionStats {
  const indicators = opts.indicators ?? DEFAULT_INDICATORS;
  const trimPct = opts.trimPct ?? 5;
  const precision = opts.precision ?? 2;
  const values = solves.map((s) => solveValue(s, precision));

  let best: number | undefined;
  let bestIndex = -1;
  let worst: number | undefined;
  let sum = 0;
  let nonDnf = 0;
  let totalMs = 0;
  values.forEach((v, i) => {
    totalMs += solves[i].ms;
    if (!Number.isFinite(v)) return;
    nonDnf++;
    sum += v;
    if (best === undefined || v < best) {
      best = v;
      bestIndex = i;
    }
    if (worst === undefined || v > worst) worst = v;
  });
  const mean =
    values.length === 0
      ? undefined
      : nonDnf === 0
        ? Infinity
        : roundAverage(sum / nonDnf, precision);

  return {
    count: values.length,
    nonDnf,
    best,
    bestIndex,
    worst,
    mean,
    sd: stdev(values),
    totalMs,
    indicators: indicators.map((ind) => {
      const series = rollingSeries(values, ind, trimPct, precision);
      let b: number | undefined;
      let bestEnd = -1;
      series.forEach((v, i) => {
        if (v === undefined) return;
        // strictly better replaces (ties keep the earlier window, like csTimer);
        // a DNF average only counts as "best" if nothing better exists
        if (b === undefined || v < b) {
          b = v;
          bestEnd = i;
        }
      });
      return {
        key: indicatorKey(ind),
        ind,
        current: series.length ? series[series.length - 1] : undefined,
        best: b,
        bestEnd,
        series,
      };
    }),
  };
}

/**
 * Personal bests for one event across every session of that event: best
 * single, best ao5, best ao12 (averages never span two sessions).
 */
export function eventBests(
  sessions: TimerSession[],
  event: string,
  precision: Precision = 2,
): { single?: number; ao5?: number; ao12?: number; count: number } {
  const out: { single?: number; ao5?: number; ao12?: number; count: number } = {
    count: 0,
  };
  const min = (a: number | undefined, b: number | undefined) =>
    b === undefined || !Number.isFinite(b) ? a : a === undefined ? b : Math.min(a, b);
  for (const s of sessions) {
    if (s.deleted || s.event !== event || s.solves.length === 0) continue;
    const st = sessionStats(s.solves, {
      indicators: [
        { kind: "ao", n: 5 },
        { kind: "ao", n: 12 },
      ],
      precision,
    });
    out.count += st.count;
    out.single = min(out.single, st.best);
    out.ao5 = min(out.ao5, st.indicators[0].best);
    out.ao12 = min(out.ao12, st.indicators[1].best);
  }
  return out;
}
