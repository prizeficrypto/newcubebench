/**
 * Public handles (the name in /app/u/<handle>). Rules:
 *   - 3-20 characters of a-z, 0-9 and underscore; typed case is kept for
 *     display, uniqueness and lookup are case-insensitive (handle_lower)
 *   - reserved words that would read as the product or staff, or collide
 *     with routes, are refused
 *   - a small blocklist keeps slurs and obvious obscenity off public pages
 *     (matched after undoing common digit swaps, so "f4ck" is caught too)
 */

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** Exact handles nobody can claim. */
const RESERVED = new Set([
  "app", "api", "admin", "join", "welcome", "settings", "u", "r", "cubebench",
  "wca", "support", "about", "privacy", "terms", "help", "login", "logout",
  "signin", "signup", "signout", "auth", "me", "you", "friends", "profile",
  "profiles", "competitions", "timer", "feedback", "staff", "team", "mod",
  "moderator", "root", "system", "official", "null", "undefined", "anonymous",
  "everyone", "security", "static", "assets", "cube_bench", "www",
]);

/** Substrings that read as the product or its staff anywhere in a handle. */
const RESERVED_PARTS = ["cubebench", "cube_bench", "admin", "moderator"];

/**
 * Offensive substrings. Deliberately short: only terms that almost never
 * appear inside an innocent word, so real names aren't refused.
 */
const BLOCKED = [
  "fuck", "shit", "cunt", "nigg", "fagg", "retard", "whore", "slut", "rapist",
  "nazi", "hitler", "porn", "penis", "vagina", "bitch", "kike", "tranny",
  "pedophil", "jizz", "dildo", "wank",
];

/** Undo the common digit-for-letter swaps before matching the blocklist. */
function deLeet(s: string): string {
  return s
    .replace(/_/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
}

export type HandleCheck =
  | { ok: true; handle: string; lower: string }
  | { ok: false; reason: "invalid" | "reserved" | "blocked" };

/** Normalize user input ("@Dan_K " → "Dan_K") and validate it. */
export function checkHandle(raw: unknown): HandleCheck {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const handle = raw.trim().replace(/^@/, "");
  const lower = handle.toLowerCase();
  if (!HANDLE_RE.test(lower)) return { ok: false, reason: "invalid" };
  if (RESERVED.has(lower) || lower.startsWith("wca") || RESERVED_PARTS.some((p) => lower.includes(p))) {
    return { ok: false, reason: "reserved" };
  }
  const plain = deLeet(lower);
  if (BLOCKED.some((w) => lower.includes(w) || plain.includes(w))) {
    return { ok: false, reason: "blocked" };
  }
  return { ok: true, handle, lower };
}

/** Escape LIKE wildcards ("_" is legal in handles) for a prefix search. */
export function likePrefix(lowerPrefix: string): string {
  return lowerPrefix.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
}
