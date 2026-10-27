import { formatTime, type Precision } from "./format.ts";
import { INSPECTION_DNF_MS, INSPECTION_MS } from "./engine.ts";

/**
 * What the big digits show. Pure so the timer page's animation frame only
 * writes a string, and so the rules are testable.
 */

/** csTimer's "timer update" options: how much of a running time to show. */
export type UpdateMode = "realtime" | "tenths" | "seconds" | "hidden";

/**
 * A running time at the chosen granularity, always truncated (a display must
 * never run ahead of the stopwatch). "hidden" returns "" and the page shows
 * a word instead.
 */
export function runningText(ms: number, mode: UpdateMode, precision: Precision): string {
  if (mode === "hidden") return "";
  const full = formatTime(ms, precision);
  if (mode === "realtime") return full;
  const dot = full.lastIndexOf(".");
  if (mode === "seconds") return full.slice(0, dot);
  return full.slice(0, dot + 2); // tenths
}

/**
 * Inspection countdown: whole seconds left (15 … 1), then "+2" past 15 s and
 * "DNF" past 17 s, matching the penalty a start at that moment would get.
 */
export function inspectionText(elapsed: number): string {
  if (elapsed > INSPECTION_DNF_MS) return "DNF";
  if (elapsed > INSPECTION_MS) return "+2";
  return String(Math.max(0, Math.ceil((INSPECTION_MS - elapsed) / 1000)));
}

/** The resting display: "0.00" (or "0.000" at millisecond precision). */
export function zeroText(precision: Precision): string {
  return formatTime(0, precision);
}

/**
 * Per-phase durations from cumulative split ends: [3200, 9000, 12000] →
 * [3200, 5800, 3000].
 */
export function phaseDurations(splits: readonly number[]): number[] {
  return splits.map((end, i) => end - (i === 0 ? 0 : splits[i - 1]));
}
