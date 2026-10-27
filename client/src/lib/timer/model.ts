/**
 * The practice timer's data model — shared by the timer UI, import/export, and
 * cloud sync. Deliberately close to csTimer's own shape so moving times between
 * the two is lossless:
 *
 *   csTimer solve: [[penalty, timeMs, ...splits], scramble, comment, unixSeconds]
 *   penalty:       0 = OK, 2000 = +2, -1 = DNF
 *
 * Times are stored RAW (stopwatch reading, penalty not included). The effective
 * time is derived — so toggling +2 on and off never drifts the time.
 */

/** 0 = OK, 2000 = +2, -1 = DNF (csTimer's encoding). */
export type Penalty = 0 | 2000 | -1;

/** How a solve's time was captured. */
export type SolveSource =
  | "timer" // keyboard / touch timer
  | "typed" // entered by hand
  | "stackmat" // StackMat via the audio jack
  | "bluetooth" // a Bluetooth smart timer
  | "import"; // imported from a file / another timer

export type TimerSolve = {
  /** stable unique id — used to edit/delete and to merge across devices */
  id: string;
  /** raw stopwatch time in ms, penalty NOT included */
  ms: number;
  penalty: Penalty;
  /** the scramble solved ("" when unknown, e.g. typed without one) */
  scramble: string;
  /** epoch ms when the solve was recorded */
  at: number;
  comment?: string;
  /** multi-phase split end-times, ms from the start (last == ms) */
  splits?: number[];
  src?: SolveSource;
};

export type TimerSession = {
  id: string;
  name: string;
  /** scramble type / WCA event id, e.g. "333", "222", "sq1" */
  event: string;
  /** chronological, oldest first */
  solves: TimerSolve[];
  createdAt: number;
  /** epoch ms of the last change of any kind — drives cloud sync (LWW) */
  updatedAt: number;
  /** display order in the session picker (lower first) */
  order: number;
  /** tombstone: kept (empty) so a delete syncs to other devices */
  deleted?: boolean;
};

export const DNF: Penalty = -1;
export const PLUS2: Penalty = 2000;

export function isDnf(s: Pick<TimerSolve, "penalty">): boolean {
  return s.penalty === -1;
}

/** Effective time in ms (raw + 2000 for +2), or null for a DNF. */
export function effectiveMs(s: Pick<TimerSolve, "ms" | "penalty">): number | null {
  if (s.penalty === -1) return null;
  return s.ms + (s.penalty === 2000 ? 2000 : 0);
}

/** Random id that is unique enough to merge across devices. */
export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
