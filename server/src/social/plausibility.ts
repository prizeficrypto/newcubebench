/**
 * Plausibility floors per event, in milliseconds. A time below its floor is
 * faster than anyone has ever done it, so it's a typo, a mis-stop, or a forged
 * request, and it never reaches a board or a profile.
 *
 * Each floor sits comfortably below the current world record (roughly 15-20%
 * under), so a genuine new record still saves. Averages get their own floor
 * because a fluke single is far more common than a fluke average. ao5 and
 * ao12 share the average floor (an ao12 is never faster than the best ao5 in
 * practice, so the looser bound is fine for both). Tune here; nothing else
 * hardcodes these.
 */
export type Floor = { singleMs: number; averageMs: number };

export const FLOORS: Record<string, Floor> = {
  "333": { singleMs: 2_500, averageMs: 3_200 },
  "222": { singleMs: 400, averageMs: 700 },
  "444": { singleMs: 13_000, averageMs: 16_000 },
  "555": { singleMs: 27_000, averageMs: 30_000 },
  "666": { singleMs: 50_000, averageMs: 55_000 },
  "777": { singleMs: 80_000, averageMs: 88_000 },
  "333oh": { singleMs: 4_500, averageMs: 6_500 },
  clock: { singleMs: 1_500, averageMs: 2_100 },
  minx: { singleMs: 19_000, averageMs: 21_000 },
  pyram: { singleMs: 600, averageMs: 1_000 },
  skewb: { singleMs: 600, averageMs: 1_000 },
  sq1: { singleMs: 2_800, averageMs: 3_500 },
  // Blindfolded events are timed too; practice PBs may include them.
  "333bf": { singleMs: 10_000, averageMs: 12_000 },
  "444bf": { singleMs: 42_000, averageMs: 50_000 },
  "555bf": { singleMs: 95_000, averageMs: 110_000 },
};

/** Events that can hold practice PBs. */
export function isPbEvent(event: string): boolean {
  return Object.prototype.hasOwnProperty.call(FLOORS, event);
}

/** Longest time we accept anywhere (3 hours): beyond it, the number is junk. */
export const MAX_TIME_MS = 3 * 60 * 60 * 1000;

/** A single is plausible for the event. */
export function plausibleSingle(event: string, ms: number): boolean {
  const f = FLOORS[event];
  return !!f && Number.isFinite(ms) && ms >= f.singleMs && ms <= MAX_TIME_MS;
}

/** An average or mean is plausible for the event. */
export function plausibleAverage(event: string, ms: number): boolean {
  const f = FLOORS[event];
  return !!f && Number.isFinite(ms) && ms >= f.averageMs && ms <= MAX_TIME_MS;
}
