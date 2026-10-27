/**
 * Per-user write limits. The shared `limit()` helper keys on IP, which is
 * wrong for signed-in writes (a school network shares one IP; one account can
 * hop IPs), so writes are also counted per user id here.
 *
 * Sliding-window log in memory, bounded to MAX_KEYS (least-recently-used
 * keys are evicted). On serverless each instance counts on its own, which
 * still blunts bursts from a single account.
 */

const MAX_KEYS = 20_000;
const hits = new Map<string, number[]>();

/**
 * Record one hit for `key` and say whether it is within `max` per `windowMs`.
 * A refused hit is not recorded, so a client that backs off recovers on time.
 */
export function allowHit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const since = now - windowMs;
  const log = (hits.get(key) ?? []).filter((t) => t > since);
  hits.delete(key); // re-insert below: Map order doubles as LRU order
  if (log.length >= max) {
    hits.set(key, log);
    return false;
  }
  log.push(now);
  hits.set(key, log);
  if (hits.size > MAX_KEYS) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }
  return true;
}

/** Named budgets so every route reads the same way. */
export const BUDGETS = {
  /** sync uploads: a big first upload is ~20-60 requests; steady state is one per solve */
  syncWrite: { max: 400, windowMs: 10 * 60 * 1000 },
  pbs: { max: 60, windowMs: 10 * 60 * 1000 },
  simResult: { max: 30, windowMs: 10 * 60 * 1000 },
  profile: { max: 30, windowMs: 10 * 60 * 1000 },
  follow: { max: 60, windowMs: 10 * 60 * 1000 },
} as const;
