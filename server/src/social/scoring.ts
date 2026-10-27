import { getEventDef, type EventFormat } from "../wcaEvents.ts";

/**
 * WCA scoring for simulated rounds, recomputed on the server. The client sends
 * raw attempts; the board ranks what WE compute, so a modified client can't
 * post an average that doesn't match its own attempts.
 *
 * Canonical rules (the same pipeline that produced the official averages the
 * simulator ranks against):
 *   - an attempt's official time is floor(rawMs / 10) centiseconds, +200 for
 *     a +2; a DNF has no time
 *   - ao5: 2+ DNFs → DNF average; 1 DNF → it is the worst, drop it and the
 *     best; otherwise drop best and worst; mean of the middle three, rounded
 *     to the nearest centisecond
 *   - mo3 (666, 777): any DNF → DNF mean; otherwise mean of all three, rounded
 */

export type SimAttempt = { rawMs: number; plus2: boolean; dnf: boolean };

/** Hard ceiling on one attempt: an hour is far past any real time limit. */
export const MAX_ATTEMPT_MS = 60 * 60 * 1000;

/** Official time in centiseconds, or null for a DNF. */
export function attemptCs(a: SimAttempt): number | null {
  if (a.dnf) return null;
  return Math.floor(a.rawMs / 10) + (a.plus2 ? 200 : 0);
}

/** Best non-DNF single in centiseconds, or null when every attempt is a DNF. */
export function bestCs(attempts: SimAttempt[]): number | null {
  let best: number | null = null;
  for (const a of attempts) {
    const cs = attemptCs(a);
    if (cs !== null && (best === null || cs < best)) best = cs;
  }
  return best;
}

/** WCA average (ao5) or mean (mo3) in centiseconds; null = DNF. */
export function averageCs(attempts: SimAttempt[], format: EventFormat): number | null {
  const times = attempts.map(attemptCs);
  const dnfs = times.filter((t) => t === null).length;
  const valid = times.filter((t): t is number => t !== null).sort((a, b) => a - b);
  if (format === "mo3") {
    if (dnfs > 0) return null;
    return Math.round(valid.reduce((s, t) => s + t, 0) / valid.length);
  }
  if (dnfs >= 2) return null;
  // One DNF is the worst attempt (already excluded), so only the best of the
  // four real times is dropped; with none, drop the best and the worst.
  const middle = dnfs === 1 ? valid.slice(1) : valid.slice(1, valid.length - 1);
  return Math.round(middle.reduce((s, t) => s + t, 0) / middle.length);
}

/**
 * Parse and validate a client-sent attempt list for an event. Returns the
 * normalized attempts, or an error message when the shape is wrong.
 */
export function parseAttempts(
  eventId: string,
  raw: unknown,
): { ok: true; attempts: SimAttempt[]; format: EventFormat } | { ok: false; error: string } {
  const def = getEventDef(eventId);
  if (!def) return { ok: false, error: "Unknown event." };
  if (!Array.isArray(raw) || raw.length !== def.solves) {
    return { ok: false, error: `This event has ${def.solves} attempts.` };
  }
  const attempts: SimAttempt[] = [];
  for (const item of raw) {
    const rawMs = (item as { rawMs?: unknown })?.rawMs;
    if (typeof rawMs !== "number" || !Number.isFinite(rawMs) || rawMs <= 0 || rawMs > MAX_ATTEMPT_MS) {
      return { ok: false, error: "An attempt time is out of range." };
    }
    attempts.push({
      rawMs: Math.round(rawMs),
      plus2: (item as { plus2?: unknown }).plus2 === true,
      dnf: (item as { dnf?: unknown }).dnf === true,
    });
  }
  return { ok: true, attempts, format: def.format };
}
