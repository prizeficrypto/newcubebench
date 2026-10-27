import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./auth.tsx";
import { store } from "./store.ts";
import { timerStore } from "./timer/storage.ts";
import { eventBests } from "./timer/stats.ts";
import type { TimerSession } from "./timer/model.ts";
import { decodeChunks, encodeChunks, hashChunk, sessionMeta } from "./syncCore.ts";

/**
 * Cloud sync of practice-timer sessions for signed-in users. Mounted once in
 * the app shell. Never blocks the timer; tolerates being offline and a server
 * whose social tables aren't set up yet (status "off").
 *
 * Per session, last writer wins by updatedAt. On sign-in/load: pull every
 * remote session that's newer than ours, then push every local one that's
 * newer than the server's. After that, local changes push ~5 s after the user
 * stops changing things, and only chunks whose hash changed are uploaded.
 */

export type SyncState = "off" | "syncing" | "synced" | "offline" | "error";
type Status = { state: SyncState; lastSyncedAt?: number; error?: string };

let status: Status = { state: "off" };
const listeners = new Set<() => void>();
function setStatus(next: Status) {
  status = next;
  listeners.forEach((fn) => fn());
}

/** Sync status for the UI ("Saved to your account · 2 min ago"). */
export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => status,
  );
}

class Unavailable extends Error {}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = store.get("cb_token") ?? "";
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && data?.code === "social_unavailable") throw new Unavailable();
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Sync failed (${res.status})`);
  return data as T;
}

type Remote = {
  id: string;
  name: string;
  event: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  hashes: string[];
};

/** What the server holds per session (from the manifest / last write). */
const known = new Map<string, Remote>();
/** Sessions never stored remotely that were dropped on first sync. */
const dropped = new Set<string>();
const MAX_BODY = 1_200_000;

async function pull(): Promise<void> {
  const { sessions } = await api<{ sessions: Remote[] }>("GET", "/api/sync/manifest");
  known.clear();
  for (const r of sessions) known.set(r.id, r);
  const local = new Map(timerStore.all().map((s) => [s.id, s]));
  const incoming: TimerSession[] = [];
  for (const r of sessions) {
    const mine = local.get(r.id);
    if (mine && mine.updatedAt >= r.updatedAt) continue;
    let solves: TimerSession["solves"] = [];
    if (!r.deleted && r.hashes.length) {
      const got = await api<{ chunks: { idx: number; data: string }[] }>("GET", `/api/sync/sessions/${encodeURIComponent(r.id)}`);
      solves = decodeChunks(got.chunks.sort((a, b) => a.idx - b.idx).map((c) => c.data));
    }
    incoming.push({ id: r.id, name: r.name, event: r.event, order: r.order, createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted, solves });
  }
  // A brand-new device: its untouched default session shouldn't join the account.
  const live = timerStore.sessions();
  if (sessions.some((r) => !r.deleted) && live.length === 1 && live[0].solves.length === 0 && !known.has(live[0].id)) {
    dropped.add(live[0].id);
  }
  if (incoming.length) timerStore.mergeRemote(incoming);
  for (const id of dropped) if (timerStore.get(id)) timerStore.remove(id);
}

async function push(session: TimerSession): Promise<void> {
  if (dropped.has(session.id)) return;
  const remote = known.get(session.id);
  if (remote && remote.updatedAt >= session.updatedAt) return;
  if (!remote && session.deleted) return; // never stored: nothing to delete
  const texts = session.deleted ? [] : encodeChunks(session.solves);
  const hashes = texts.map(hashChunk);
  let todo = hashes.flatMap((h, i) => (remote?.hashes[i] === h ? [] : [i]));
  for (let guard = 0; guard < 50; guard++) {
    // Batch chunks under the request size limit.
    const batch: { idx: number; data: string }[] = [];
    let size = 0;
    for (const idx of todo) {
      if (batch.length && size + texts[idx].length > MAX_BODY) break;
      batch.push({ idx, data: texts[idx] });
      size += texts[idx].length;
    }
    const res = await api<{ status: "ok" | "partial" | "stale"; session?: Remote; missing?: number[] }>(
      "PUT",
      `/api/sync/sessions/${encodeURIComponent(session.id)}`,
      { ...sessionMeta(session), hashes, chunks: batch },
    );
    if (res.status === "ok" && res.session) {
      known.set(session.id, res.session);
      return;
    }
    if (res.status === "stale") {
      await pull(); // someone else wrote a newer copy: take theirs
      return;
    }
    // "partial": the server lists exactly the chunks it still needs.
    todo = res.missing ?? [];
    if (!todo.length) return;
  }
}

let lastPbs = "";
async function pushPbs(): Promise<void> {
  const sessions = timerStore.sessions();
  const events = [...new Set(sessions.map((s) => s.event))];
  const pbs: Record<string, { single?: number; ao5?: number; ao12?: number; count: number }> = {};
  for (const ev of events) {
    const b = eventBests(sessions, ev);
    if (b.count) pbs[ev] = b;
  }
  const json = JSON.stringify(pbs);
  if (json === lastPbs) return;
  await api("PUT", "/api/social/pbs", { pbs });
  lastPbs = json;
}

let running: Promise<void> | null = null;
const dirty = new Set<string>();

async function syncNow(full: boolean): Promise<void> {
  if (running) return running;
  running = (async () => {
    setStatus({ ...status, state: "syncing" });
    try {
      await timerStore.ready;
      if (full) await pull();
      const ids = full ? timerStore.all().map((s) => s.id) : [...dirty];
      dirty.clear();
      for (const id of ids) {
        const s = timerStore.all().find((x) => x.id === id);
        if (s) await push(s);
      }
      await pushPbs();
      setStatus({ state: "synced", lastSyncedAt: Date.now() });
    } catch (err) {
      if (err instanceof Unavailable) setStatus({ state: "off" });
      else if (!navigator.onLine) setStatus({ ...status, state: "offline" });
      else setStatus({ ...status, state: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      running = null;
    }
  })();
  return running;
}

export function useCloudSync(): void {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setStatus({ state: "off" });
      return;
    }
    known.clear();
    lastPbs = "";
    void syncNow(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = timerStore.subscribe((origin, ids) => {
      if (origin !== "local" || ids.length === 0) return;
      ids.forEach((id) => dirty.add(id));
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(false), 5000);
    });
    const flush = () => {
      if (document.visibilityState === "hidden" && dirty.size) void syncNow(false);
    };
    const online = () => void syncNow(true);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("online", online);
    return () => {
      unsub();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("online", online);
    };
  }, [userId]);
}
