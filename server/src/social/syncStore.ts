import { sql } from "../db.ts";
import { SocialError } from "./errors.ts";
import { LIMITS, type PutBody } from "./syncCodec.ts";

/**
 * Cloud-saved timer sessions in Postgres. Last writer wins per session by the
 * client's updatedAt. A write may arrive in several requests (big sessions are
 * batched under the body limit): chunks are stored as they come, and the meta
 * row only moves to the new version once every declared chunk is present, so
 * a reader never sees a half-written session as current.
 */

export type ManifestEntry = {
  id: string;
  name: string;
  event: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  hashes: string[];
  solveCount: number;
};

type MetaRow = {
  id: string;
  name: string;
  event: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  chunk_hashes: string[] | null;
  solve_count: number;
};

function toEntry(r: MetaRow): ManifestEntry {
  return {
    id: r.id,
    name: r.name,
    event: r.event,
    order: r.sort_order,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    deleted: r.deleted,
    hashes: Array.isArray(r.chunk_hashes) ? r.chunk_hashes : [],
    solveCount: r.solve_count,
  };
}

/** Every session's meta (tombstones included) for one user. */
export async function getManifest(userId: string): Promise<ManifestEntry[]> {
  const rows = await sql<MetaRow[]>`
    select id, name, event, sort_order, created_at, updated_at, deleted,
           chunk_hashes, solve_count
    from timer_sessions
    where user_id = ${userId}
    order by sort_order, created_at
  `;
  return rows.map(toEntry);
}

/** Response bytes per GET: well under Vercel's 4.5 MB response cap. */
const READ_BUDGET_BYTES = 3_000_000;

/**
 * A session's meta plus the requested chunks (all of them when `idxs` is
 * null). Chunks that don't fit the response budget are listed in `pending`
 * for the client to fetch next. Throws 409 "sync_busy" if a chunk doesn't
 * match the committed hashes (a multi-request upload is mid-flight).
 */
export async function getSessionChunks(
  userId: string,
  sessionId: string,
  idxs: number[] | null,
): Promise<{
  session: ManifestEntry;
  chunks: { idx: number; hash: string; data: string }[];
  pending: number[];
} | null> {
  const metaRows = await sql<MetaRow[]>`
    select id, name, event, sort_order, created_at, updated_at, deleted,
           chunk_hashes, solve_count
    from timer_sessions
    where user_id = ${userId} and id = ${sessionId}
  `;
  if (!metaRows[0]) return null;
  const session = toEntry(metaRows[0]);
  const all = session.hashes.map((_, i) => i);
  const wanted = (idxs ?? all).filter((i) => i < session.hashes.length);
  if (wanted.length === 0) return { session, chunks: [], pending: [] };

  // Sizes first (cheap, no TOAST reads) to pick what fits this response.
  const sizes = await sql<{ idx: number; bytes: number }[]>`
    select idx, bytes from timer_chunks
    where user_id = ${userId} and session_id = ${sessionId}
      and idx = any(${sql.array(wanted)}::int[])
    order by idx
  `;
  if (sizes.length !== wanted.length) {
    throw new SocialError(409, "sync_busy", "This session is still uploading. Try again in a moment.");
  }
  const take: number[] = [];
  let budget = READ_BUDGET_BYTES;
  for (const s of sizes) {
    if (take.length > 0 && s.bytes > budget) break;
    take.push(s.idx);
    budget -= s.bytes;
  }
  const chunks = await sql<{ idx: number; hash: string; data: string }[]>`
    select idx, hash, data from timer_chunks
    where user_id = ${userId} and session_id = ${sessionId}
      and idx = any(${sql.array(take)}::int[])
    order by idx
  `;
  if (chunks.some((c) => c.hash !== session.hashes[c.idx])) {
    throw new SocialError(409, "sync_busy", "This session is still uploading. Try again in a moment.");
  }
  const taken = new Set(take);
  return { session, chunks, pending: wanted.filter((i) => !taken.has(i)) };
}

export type PutResult =
  | { status: "ok"; session: ManifestEntry }
  | { status: "partial"; missing: number[] }
  | { status: "stale"; session: ManifestEntry };

/**
 * Store one write of a session (or one batch of it). See the module comment
 * for the commit rule. Enforces the per-user caps before storing anything.
 */
export async function putSession(userId: string, sessionId: string, body: PutBody): Promise<PutResult> {
  const { meta, hashes, chunks } = body;
  return sql.begin(async (tx) => {
    const cur = (
      await tx<MetaRow[]>`
        select id, name, event, sort_order, created_at, updated_at, deleted,
               chunk_hashes, solve_count
        from timer_sessions
        where user_id = ${userId} and id = ${sessionId}
        for update
      `
    )[0];
    if (cur && Number(cur.updated_at) > meta.updatedAt) {
      return { status: "stale", session: toEntry(cur) } as const;
    }

    if (meta.deleted) {
      await tx`delete from timer_chunks where user_id = ${userId} and session_id = ${sessionId}`;
      const saved = await upsertMeta(tx, userId, sessionId, body, 0);
      // Tombstones are tiny, but not free: keep the newest LIMITS.tombstones.
      await tx`
        delete from timer_sessions
        where user_id = ${userId} and deleted and id in (
          select id from timer_sessions
          where user_id = ${userId} and deleted
          order by updated_at desc
          offset ${LIMITS.tombstones}
        )
      `;
      return { status: "ok", session: saved } as const;
    }

    if (!cur || cur.deleted) {
      const [{ live }] = await tx<{ live: number }[]>`
        select count(*)::int as live from timer_sessions
        where user_id = ${userId} and not deleted and id <> ${sessionId}
      `;
      if (live >= LIMITS.sessions) {
        throw new SocialError(
          413,
          "limit_sessions",
          `You can keep up to ${LIMITS.sessions} sessions in your account. Delete or merge some to keep syncing.`,
        );
      }
    }

    // Projected totals after this write: everything stored except the chunks
    // this write replaces or drops, plus what it uploads.
    const supplied = chunks.map((c) => c.idx);
    const [totals] = await tx<{ n: number; bytes: string; rows: number }[]>`
      select coalesce(sum(n), 0)::int as n,
             coalesce(sum(bytes), 0)::bigint as bytes,
             count(*)::int as rows
      from timer_chunks
      where user_id = ${userId}
        and not (
          session_id = ${sessionId}
          and (idx >= ${hashes.length} or idx = any(${tx.array(supplied)}::int[]))
        )
    `;
    const solves = totals.n + chunks.reduce((s, c) => s + c.count, 0);
    const bytes = Number(totals.bytes) + chunks.reduce((s, c) => s + c.data.length, 0);
    if (solves > LIMITS.solves) {
      throw new SocialError(
        413,
        "limit_solves",
        `Your account can hold up to ${LIMITS.solves.toLocaleString("en-US")} solves. Older sessions stay on this device.`,
      );
    }
    if (bytes > LIMITS.bytes || totals.rows + chunks.length > LIMITS.chunkRows) {
      throw new SocialError(413, "limit_storage", "Your saved times reached the storage limit for one account.");
    }

    if (chunks.length > 0) {
      const rows = chunks.map((c) => ({
        user_id: userId,
        session_id: sessionId,
        idx: c.idx,
        hash: c.hash,
        n: c.count,
        bytes: c.data.length,
        data: c.data,
      }));
      await tx`
        insert into timer_chunks ${tx(rows, "user_id", "session_id", "idx", "hash", "n", "bytes", "data")}
        on conflict (user_id, session_id, idx) do update set
          hash = excluded.hash, n = excluded.n, bytes = excluded.bytes, data = excluded.data
      `;
    }

    const stored = await tx<{ idx: number; hash: string; n: number }[]>`
      select idx, hash, n from timer_chunks
      where user_id = ${userId} and session_id = ${sessionId} and idx < ${hashes.length}
    `;
    const byIdx = new Map(stored.map((r) => [r.idx, r]));
    const missing = hashes.flatMap((h, i) => (byIdx.get(i)?.hash === h ? [] : [i]));
    if (missing.length > 0) return { status: "partial", missing } as const;

    await tx`
      delete from timer_chunks
      where user_id = ${userId} and session_id = ${sessionId} and idx >= ${hashes.length}
    `;
    const solveCount = stored.reduce((s, r) => s + r.n, 0);
    const saved = await upsertMeta(tx, userId, sessionId, body, solveCount);
    return { status: "ok", session: saved } as const;
  });
}

type Tx = Parameters<Parameters<typeof sql.begin>[0]>[0];

async function upsertMeta(
  tx: Tx,
  userId: string,
  sessionId: string,
  body: PutBody,
  solveCount: number,
): Promise<ManifestEntry> {
  const { meta, hashes } = body;
  const rows = await tx<MetaRow[]>`
    insert into timer_sessions (
      user_id, id, name, event, sort_order, created_at, updated_at, deleted,
      chunk_count, chunk_hashes, solve_count
    ) values (
      ${userId}, ${sessionId}, ${meta.name}, ${meta.event}, ${meta.order},
      ${meta.createdAt}, ${meta.updatedAt}, ${meta.deleted},
      ${hashes.length}, ${tx.json(hashes)}, ${solveCount}
    )
    on conflict (user_id, id) do update set
      name = excluded.name, event = excluded.event, sort_order = excluded.sort_order,
      created_at = excluded.created_at, updated_at = excluded.updated_at,
      deleted = excluded.deleted, chunk_count = excluded.chunk_count,
      chunk_hashes = excluded.chunk_hashes, solve_count = excluded.solve_count
    returning id, name, event, sort_order, created_at, updated_at, deleted,
              chunk_hashes, solve_count
  `;
  return toEntry(rows[0]);
}
