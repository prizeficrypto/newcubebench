import { useSyncExternalStore } from "react";
import { store } from "../store.ts";
import { newId, type TimerSession, type TimerSolve } from "./model.ts";

/**
 * Where practice sessions live on this device.
 *
 * IndexedDB is the primary store (no 5 MB localStorage ceiling — a heavy user
 * can have tens of thousands of solves with scrambles). If IndexedDB is
 * unavailable (some private modes / webviews) we fall back to localStorage via
 * the never-throwing `store`. Either way the app works against an in-memory
 * copy: reads are synchronous, writes persist in the background.
 *
 * Changes are broadcast to subscribers with their origin — "local" (the user
 * did something on this device) or "remote" (cloud sync merged another
 * device's copy) — so sync pushes only what changed here.
 */

const DB_NAME = "cubebench";
const DB_VERSION = 1;
const STORE = "timer_sessions";
const LS_PREFIX = "cb_timer_v4:s:"; // localStorage fallback, one key per session
const ACTIVE_KEY = "cb_timer_active_v4";
const MIGRATED_KEY = "cb_timer_migrated_v4";
/** v3 (single-session-per-puzzle) keys, migrated once into v4 sessions */
const LEGACY_PREFIX = "cb_timer_sess_v3:";
const LEGACY_EVENTS = [
  "333", "222", "444", "555", "666", "777", "333oh",
  "pyram", "skewb", "minx", "clock", "sq1",
];
const LEGACY_NAMES: Record<string, string> = {
  "333": "3×3", "222": "2×2", "444": "4×4", "555": "5×5", "666": "6×6",
  "777": "7×7", "333oh": "3×3 OH", pyram: "Pyraminx", skewb: "Skewb",
  minx: "Megaminx", clock: "Clock", sq1: "Square-1",
};

export type ChangeOrigin = "local" | "remote";
type Listener = (origin: ChangeOrigin, ids: string[]) => void;

const sessions = new Map<string, TimerSession>();
const listeners = new Set<Listener>();
let version = 0;
let activeId = store.get(ACTIVE_KEY) ?? "";
let db: IDBDatabase | null = null;

// ---------- persistence ----------

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGetAll(d: IDBDatabase): Promise<TimerSession[]> {
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as TimerSession[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function lsGetAll(): TimerSession[] {
  const out: TimerSession[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LS_PREFIX)) continue;
      const s = store.getJson<TimerSession>(key);
      if (s?.id) out.push(s);
    }
  } catch {
    /* storage blocked — nothing persisted */
  }
  return out;
}

function persist(list: TimerSession[]): void {
  if (db) {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      for (const s of list) os.put(s);
      return;
    } catch {
      /* fall through to localStorage */
    }
  }
  for (const s of list) store.setJson(LS_PREFIX + s.id, s);
}

// ---------- migration from the v3 single-session timer ----------

function migrateLegacy(): TimerSession[] {
  if (store.get(MIGRATED_KEY)) return [];
  const out: TimerSession[] = [];
  const now = Date.now();
  LEGACY_EVENTS.forEach((ev, idx) => {
    const old = store.getJson<{ totalMs: number }[]>(LEGACY_PREFIX + ev);
    if (!old || old.length === 0) return;
    const solves: TimerSolve[] = old
      .filter((o) => typeof o?.totalMs === "number" && o.totalMs > 0)
      .map((o, i) => ({
        id: newId(),
        ms: Math.round(o.totalMs),
        penalty: 0,
        scramble: "",
        // v3 kept no timestamps; space them a second apart, in order
        at: now - (old.length - i) * 1000,
        src: "import",
      }));
    if (solves.length === 0) return;
    out.push({
      id: newId(),
      name: LEGACY_NAMES[ev] ?? ev,
      event: ev,
      solves,
      createdAt: now,
      updatedAt: now,
      order: idx,
    });
  });
  store.set(MIGRATED_KEY, "1");
  return out;
}

// ---------- notify ----------

function emit(origin: ChangeOrigin, ids: string[]): void {
  version++;
  for (const fn of listeners) fn(origin, ids);
}

function live(): TimerSession[] {
  return [...sessions.values()]
    .filter((s) => !s.deleted)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Make sure there is at least one live session and a valid active one. */
function ensureActive(): string[] {
  const changed: string[] = [];
  let list = live();
  if (list.length === 0) {
    const s = blankSession("3×3", "333", 0);
    sessions.set(s.id, s);
    persist([s]);
    changed.push(s.id);
    list = [s];
  }
  if (!list.some((s) => s.id === activeId)) {
    activeId = list[0].id;
    store.set(ACTIVE_KEY, activeId);
  }
  return changed;
}

function blankSession(name: string, event: string, order: number): TimerSession {
  const now = Date.now();
  return { id: newId(), name, event, solves: [], createdAt: now, updatedAt: now, order };
}

// ---------- load ----------

const ready: Promise<void> = (async () => {
  db = await openDb();
  const loaded = db ? await idbGetAll(db) : lsGetAll();
  for (const s of loaded) sessions.set(s.id, s);
  // A browser that once fell back to localStorage and now has IndexedDB:
  // fold those sessions in (newest copy wins) and move them over.
  if (db) {
    const stray = lsGetAll();
    const moved: TimerSession[] = [];
    for (const s of stray) {
      const cur = sessions.get(s.id);
      if (!cur || cur.updatedAt < s.updatedAt) {
        sessions.set(s.id, s);
        moved.push(s);
      }
      store.remove(LS_PREFIX + s.id);
    }
    if (moved.length) persist(moved);
  }
  const migrated = migrateLegacy();
  for (const s of migrated) sessions.set(s.id, s);
  if (migrated.length) persist(migrated);
  ensureActive();
  emit("local", migrated.map((s) => s.id));
})();

// ---------- public API ----------

export const timerStore = {
  /** resolves once sessions are loaded from disk */
  ready,

  /** live sessions in display order */
  sessions(): TimerSession[] {
    return live();
  },

  /** every session including delete tombstones — for cloud sync */
  all(): TimerSession[] {
    return [...sessions.values()];
  },

  get(id: string): TimerSession | undefined {
    const s = sessions.get(id);
    return s && !s.deleted ? s : undefined;
  },

  activeId(): string {
    return activeId;
  },

  active(): TimerSession | undefined {
    return timerStore.get(activeId);
  },

  setActive(id: string): void {
    if (!timerStore.get(id) || id === activeId) return;
    activeId = id;
    store.set(ACTIVE_KEY, id);
    emit("local", []);
  },

  /** Create a session (appended to the end) and make it active. */
  create(name: string, event: string): TimerSession {
    const order = Math.max(-1, ...live().map((s) => s.order)) + 1;
    const s = blankSession(name.trim() || "Session", event, order);
    sessions.set(s.id, s);
    persist([s]);
    activeId = s.id;
    store.set(ACTIVE_KEY, s.id);
    emit("local", [s.id]);
    return s;
  },

  /** Apply a change to one session; bumps updatedAt, persists, notifies. */
  update(id: string, change: (s: TimerSession) => TimerSession): void {
    const cur = sessions.get(id);
    if (!cur || cur.deleted) return;
    const next = { ...change(cur), id: cur.id, updatedAt: Date.now() };
    sessions.set(id, next);
    persist([next]);
    emit("local", [id]);
  },

  /** Append a solve to a session. */
  addSolve(id: string, solve: TimerSolve): void {
    timerStore.update(id, (s) => ({ ...s, solves: [...s.solves, solve] }));
  },

  /** Edit one solve in place (penalty, comment, …). */
  updateSolve(id: string, solveId: string, patch: Partial<TimerSolve>): void {
    timerStore.update(id, (s) => ({
      ...s,
      solves: s.solves.map((x) => (x.id === solveId ? { ...x, ...patch, id: x.id } : x)),
    }));
  },

  deleteSolve(id: string, solveId: string): void {
    timerStore.update(id, (s) => ({
      ...s,
      solves: s.solves.filter((x) => x.id !== solveId),
    }));
  },

  /** Delete a session (kept as an empty tombstone so the delete syncs). */
  remove(id: string): void {
    const cur = sessions.get(id);
    if (!cur || cur.deleted) return;
    const tomb: TimerSession = { ...cur, solves: [], deleted: true, updatedAt: Date.now() };
    sessions.set(id, tomb);
    persist([tomb]);
    const created = ensureActive();
    emit("local", [id, ...created]);
  },

  /** Add many sessions at once (import). Returns nothing; notifies once. */
  addMany(list: TimerSession[]): void {
    if (list.length === 0) return;
    let order = Math.max(-1, ...live().map((s) => s.order)) + 1;
    const now = Date.now();
    const added = list.map((s) => ({ ...s, order: order++, updatedAt: now }));
    for (const s of added) sessions.set(s.id, s);
    persist(added);
    emit("local", added.map((s) => s.id));
  },

  /**
   * Merge sessions from the cloud. Last writer wins per session, by
   * updatedAt; does NOT bump updatedAt (so it never echoes back as a change).
   */
  mergeRemote(remote: TimerSession[]): void {
    const changed: TimerSession[] = [];
    for (const r of remote) {
      if (!r?.id) continue;
      const cur = sessions.get(r.id);
      if (!cur || cur.updatedAt < r.updatedAt) {
        sessions.set(r.id, r);
        changed.push(r);
      }
    }
    if (changed.length === 0) return;
    persist(changed);
    ensureActive();
    emit("remote", changed.map((s) => s.id));
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** monotonically increasing; changes on every mutation */
  version(): number {
    return version;
  },
};

const subscribeAny = (cb: () => void) => timerStore.subscribe(() => cb());

/**
 * React binding: re-renders on any change. Returns the live sessions and the
 * active one (undefined only before the first load finishes).
 */
export function useTimerStore(): {
  sessions: TimerSession[];
  active: TimerSession | undefined;
  version: number;
} {
  const v = useSyncExternalStore(subscribeAny, timerStore.version);
  return { sessions: timerStore.sessions(), active: timerStore.active(), version: v };
}
