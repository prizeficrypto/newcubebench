/**
 * localStorage that never throws. Some environments (cookies blocked,
 * certain webviews, private modes) throw SecurityError on any access —
 * previously that hung the auth restore forever. Falls back to an in-memory
 * map: persistence degrades to session-lifetime instead of crashing.
 */

const memory = new Map<string, string>();

export const store = {
  get(key: string): string | null {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : (memory.get(key) ?? null);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* memory fallback already holds it */
    }
  },
  remove(key: string): void {
    memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
  getJson<T>(key: string): T | null {
    const raw = store.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      store.remove(key); // corrupted entry: drop it rather than loop on it
      return null;
    }
  },
  setJson(key: string, value: unknown): void {
    store.set(key, JSON.stringify(value));
  },
};
