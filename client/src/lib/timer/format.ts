import { type TimerSolve } from "./model.ts";

/**
 * Time formatting for the practice timer.
 *
 * Singles are TRUNCATED to the shown precision (WCA Regulation 9f1: timed
 * results are truncated to the hundredth — and it's what csTimer does), so a
 * 12.349 solve reads 12.34. Averages arrive already rounded (see stats.ts),
 * so truncating them again is a no-op.
 */

/** 2 = hundredths (default, WCA), 3 = milliseconds */
export type Precision = 2 | 3;

/** Truncate a duration to the precision's unit (10 ms or 1 ms). */
export function truncateMs(ms: number, precision: Precision): number {
  return precision === 3 ? Math.floor(ms) : Math.floor(ms / 10) * 10;
}

/** ms -> "9.87", "1:02.50", "1:02:03.40" (truncated, never rounded up). */
export function formatTime(ms: number, precision: Precision = 2): string {
  const unit = precision === 3 ? 1 : 10;
  const t = Math.max(0, Math.floor(ms / unit)); // whole units
  const perSec = 1000 / unit;
  const frac = String(t % perSec).padStart(precision, "0");
  const totalSec = Math.floor(t / perSec);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${frac}`;
  }
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}.${frac}`;
  return `${s}.${frac}`;
}

/**
 * A solve as cubers read it: "12.34", "14.34+" (+2 shows the FINAL time with a
 * trailing plus), "DNF". `withRaw` shows a DNF's stopwatch time: "DNF(12.34)".
 */
export function formatSolve(
  s: Pick<TimerSolve, "ms" | "penalty">,
  precision: Precision = 2,
  withRaw = false,
): string {
  if (s.penalty === -1) return withRaw ? `DNF(${formatTime(s.ms, precision)})` : "DNF";
  if (s.penalty === 2000) return `${formatTime(s.ms + 2000, precision)}+`;
  return formatTime(s.ms, precision);
}

/**
 * A statistic: undefined → "–" (not enough solves yet), Infinity → "DNF",
 * otherwise the time.
 */
export function formatStat(v: number | undefined, precision: Precision = 2): string {
  if (v === undefined) return "–";
  if (!Number.isFinite(v)) return "DNF";
  return formatTime(v, precision);
}
