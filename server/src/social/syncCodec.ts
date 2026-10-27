/**
 * Cloud-saved timer sessions: the wire format and its limits, shared by the
 * sync routes. Pure, so it's unit-tested without a database.
 *
 * A session is stored as one meta row plus its solves split into fixed-size
 * chunks. Each chunk is a compact JSON array of solve tuples kept in a TEXT
 * column (Postgres TOAST compresses it). The client hashes each chunk and
 * only uploads the ones whose hash changed, so appending a solve re-sends just
 * the last chunk. The server re-hashes what it receives so a stored hash
 * always matches its data.
 *
 * Solve tuple (trailing absent fields omitted, holes filled with 0):
 *   [id, ms, penalty, scramble, dt, comment?, splits?, src?]
 *   - id: the solve id; a UUID is packed as "~" + 22 base64url chars
 *   - dt: ms since the previous solve in the chunk (the first is absolute)
 * The server only checks shape and bounds; decoding is the client's job.
 *
 * This file mirrors client/src/components/social/syncCore.ts. The hash test
 * vectors in both test files must stay identical.
 */

/** Solves per chunk. Small enough that the hot last chunk is a few KB (cheap
 *  appends, keepalive-sized), large enough to keep row counts low. */
export const CHUNK_SIZE = 200;

export const LIMITS = {
  /** live (non-deleted) sessions per user */
  sessions: 300,
  /** delete tombstones kept per user (oldest pruned beyond this) */
  tombstones: 500,
  /** solves across all of a user's sessions */
  solves: 200_000,
  /** raw chunk text across all of a user's sessions */
  bytes: 40 * 1024 * 1024,
  /** chunks one session can have */
  chunksPerSession: 1_000,
  /** chunk rows across all of a user's sessions (full ones + one tail each) */
  chunkRows: 2_000,
  /** chunks one request may carry */
  chunksPerRequest: 200,
  /** one chunk's text */
  chunkBytes: 1_500_000,
} as const;

const MAX_ID = 80;
const MAX_SCRAMBLE = 2_000;
const MAX_COMMENT = 1_000;
const MAX_SPLITS = 32;
const MAX_SOLVE_MS = 3 * 60 * 60 * 1000;
/** Earliest plausible timestamp (2000-01-01) and the allowed clock skew. */
const MIN_EPOCH_MS = 946_684_800_000;
const MAX_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * 64-bit string hash (two 32-bit lanes of the cyrb53 construction), hex.
 * Not cryptographic: it only has to tell "this chunk changed" apart, and at
 * 64 bits an accidental collision is negligible. Pure JS so the browser and
 * Node produce the same value without async crypto.
 */
export function hashChunk(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export const HASH_RE = /^[0-9a-f]{16}$/;
export const SESSION_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Validate one solve tuple's shape and bounds. */
function validSolve(t: unknown): boolean {
  if (!Array.isArray(t) || t.length < 5 || t.length > 8) return false;
  const [id, ms, penalty, scramble, dt, comment, splits, src] = t;
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID) return false;
  if (!isInt(ms) || ms < 0 || ms > MAX_SOLVE_MS) return false;
  if (penalty !== 0 && penalty !== 2000 && penalty !== -1) return false;
  if (typeof scramble !== "string" || scramble.length > MAX_SCRAMBLE) return false;
  if (!isInt(dt)) return false;
  if (comment !== undefined && comment !== 0 && (typeof comment !== "string" || comment.length > MAX_COMMENT)) {
    return false;
  }
  if (
    splits !== undefined &&
    splits !== 0 &&
    !(Array.isArray(splits) && splits.length <= MAX_SPLITS && splits.every((x) => isInt(x) && x >= 0 && x <= MAX_SOLVE_MS))
  ) {
    return false;
  }
  if (src !== undefined && src !== 0 && (typeof src !== "string" || src.length > 16)) return false;
  return true;
}

/**
 * Check a chunk's text: a JSON array of 1..CHUNK_SIZE valid solve tuples.
 * Returns the solve count, or an error.
 */
export function inspectChunk(text: unknown): { ok: true; count: number } | { ok: false; error: string } {
  if (typeof text !== "string" || text.length === 0) return { ok: false, error: "Empty chunk." };
  if (text.length > LIMITS.chunkBytes) return { ok: false, error: "A chunk is too large." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "A chunk isn't valid JSON." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > CHUNK_SIZE) {
    return { ok: false, error: `A chunk must hold 1 to ${CHUNK_SIZE} solves.` };
  }
  if (!parsed.every(validSolve)) return { ok: false, error: "A solve in a chunk is malformed." };
  return { ok: true, count: parsed.length };
}

export type SessionMeta = {
  name: string;
  event: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
};

export type PutBody = {
  meta: SessionMeta;
  /** the full ordered list of chunk hashes after this write */
  hashes: string[];
  /** the chunks being uploaded in this request (a subset of `hashes`) */
  chunks: { idx: number; data: string; hash: string; count: number }[];
};

/** Validate a PUT /api/sync/sessions/:id body. */
export function parsePutBody(raw: unknown, now = Date.now()): { ok: true; body: PutBody } | { ok: false; error: string } {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return { ok: false, error: "Missing body." };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  const event = typeof b.event === "string" ? b.event : "";
  if (!/^[a-z0-9_-]{1,24}$/i.test(event)) return { ok: false, error: "Invalid event." };
  const { order, createdAt, updatedAt } = b;
  if (!isInt(order) || Math.abs(order) > 1_000_000) return { ok: false, error: "Invalid order." };
  for (const t of [createdAt, updatedAt]) {
    if (!isInt(t) || t < MIN_EPOCH_MS) return { ok: false, error: "Invalid timestamp." };
  }
  if ((updatedAt as number) > now + MAX_SKEW_MS) {
    return { ok: false, error: "Your device clock looks wrong. Fix the date and time, then try again." };
  }
  const deleted = b.deleted === true;
  const hashes = b.hashes;
  if (!Array.isArray(hashes) || hashes.length > LIMITS.chunksPerSession || !hashes.every((h) => typeof h === "string" && HASH_RE.test(h))) {
    return { ok: false, error: "Invalid chunk hashes." };
  }
  if (deleted && hashes.length > 0) return { ok: false, error: "A deleted session has no solves." };
  const rawChunks = b.chunks ?? [];
  if (!Array.isArray(rawChunks) || rawChunks.length > LIMITS.chunksPerRequest) {
    return { ok: false, error: "Too many chunks in one request." };
  }
  const chunks: PutBody["chunks"] = [];
  const seen = new Set<number>();
  for (const c of rawChunks) {
    const idx = (c as { idx?: unknown })?.idx;
    const data = (c as { data?: unknown })?.data;
    if (!isInt(idx) || idx < 0 || idx >= hashes.length || seen.has(idx)) {
      return { ok: false, error: "Invalid chunk index." };
    }
    seen.add(idx);
    const check = inspectChunk(data);
    if (!check.ok) return check;
    const hash = hashChunk(data as string);
    if (hash !== hashes[idx]) return { ok: false, error: "A chunk doesn't match its hash." };
    // Every chunk but the last is full, so solve indexes stay aligned.
    if (idx < hashes.length - 1 && check.count !== CHUNK_SIZE) {
      return { ok: false, error: "Only the last chunk may be partly filled." };
    }
    chunks.push({ idx, data: data as string, hash, count: check.count });
  }
  return {
    ok: true,
    body: {
      meta: {
        name: name || "Session",
        event,
        order: order as number,
        createdAt: createdAt as number,
        updatedAt: updatedAt as number,
        deleted,
      },
      hashes: hashes as string[],
      chunks,
    },
  };
}

/** Parse "?idx=0,3,4" into a sorted, de-duplicated, bounded index list. */
export function parseIdxList(raw: unknown, max = LIMITS.chunksPerSession): number[] | null {
  if (raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 6_000) return [];
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part);
    if (Number.isInteger(n) && n >= 0 && n < max) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
