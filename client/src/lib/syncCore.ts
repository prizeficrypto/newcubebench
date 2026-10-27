import type { Penalty, SolveSource, TimerSession, TimerSolve } from "./timer/model.ts";

/**
 * The cloud-sync wire format (pure; mirrors server/src/social/syncCodec.ts).
 *
 * A session's solves travel in fixed-size chunks; each chunk is a compact
 * JSON array of solve tuples:
 *   [id, ms, penalty, scramble, dt, comment?, splits?, src?]
 * where dt is ms since the previous solve in the chunk (the first is the
 * absolute epoch ms) and trailing absent fields are omitted (holes are 0).
 * Each chunk is hashed so only changed chunks are uploaded.
 */

/** Must equal the server's CHUNK_SIZE. */
export const CHUNK_SIZE = 200;

/** 64-bit cyrb53-style hash, hex — identical to the server's hashChunk. */
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

type Tuple = [string, number, Penalty, string, number, (string | 0)?, (number[] | 0)?, (string | 0)?];

function toTuple(s: TimerSolve, prevAt: number | null): Tuple {
  const t: Tuple = [s.id, Math.round(s.ms), s.penalty, s.scramble, prevAt === null ? s.at : s.at - prevAt];
  const tail: [string | 0, number[] | 0, string | 0] = [s.comment || 0, s.splits?.length ? s.splits.map(Math.round) : 0, s.src || 0];
  // keep up to the last non-empty optional field
  let last = -1;
  tail.forEach((v, i) => {
    if (v !== 0) last = i;
  });
  for (let i = 0; i <= last; i++) t.push(tail[i] as never);
  return t;
}

/** A session's solves → chunk texts (each ≤ CHUNK_SIZE solves). */
export function encodeChunks(solves: TimerSolve[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < solves.length; i += CHUNK_SIZE) {
    const part = solves.slice(i, i + CHUNK_SIZE);
    let prev: number | null = null;
    out.push(
      JSON.stringify(
        part.map((s) => {
          const t = toTuple(s, prev);
          prev = s.at;
          return t;
        }),
      ),
    );
  }
  return out;
}

/** Chunk texts → solves (in order). Malformed tuples are skipped. */
export function decodeChunks(chunks: string[]): TimerSolve[] {
  const out: TimerSolve[] = [];
  for (const text of chunks) {
    let rows: unknown;
    try {
      rows = JSON.parse(text);
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    let at: number | null = null;
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 5) continue;
      const [id, ms, penalty, scramble, dt, comment, splits, src] = r as Tuple;
      at = at === null ? dt : at + dt;
      out.push({
        id: String(id),
        ms,
        penalty,
        scramble: String(scramble ?? ""),
        at,
        ...(comment ? { comment: String(comment) } : {}),
        ...(Array.isArray(splits) && splits.length ? { splits } : {}),
        ...(src ? { src: src as SolveSource } : {}),
      });
    }
  }
  return out;
}

/** The PUT body's metadata for a session. */
export function sessionMeta(s: TimerSession) {
  return {
    name: s.name,
    event: s.event,
    order: s.order,
    createdAt: Math.round(s.createdAt),
    updatedAt: Math.round(s.updatedAt),
    deleted: Boolean(s.deleted),
  };
}
