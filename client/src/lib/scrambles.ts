/**
 * Practice scrambles for the Timer.
 *
 * Real WCA scrambles come from cubing.js (`randomScrambleForEvent`), the same
 * random-state generators the WCA uses (via TNoodle) for 2x2-5x5, the blind
 * events, FMC, Pyraminx, Skewb, Clock and Square-1, and constrained random
 * moves for 6x6/7x7/Megaminx. cubing.js runs its search in a Web Worker
 * (WASM), loaded lazily, and is buffered so the next solve's scramble is
 * usually ready before it is asked for.
 *
 * If generation fails or is slow (worker/WASM unavailable, a cold 4x4 table
 * on a slow phone), callers get a dependency-free random-move scramble,
 * labelled as such, so the timer still works: degraded, never broken.
 *
 * Audit notes (the "scrambles sometimes aren't updated" report). The previous
 * version buffered finished STRINGS and started a refill before generating a
 * cold request, which caused:
 *   1. A cold request waited for TWO generations: the refill was queued in the
 *      single worker first and the caller's own request behind it, so the
 *      scramble seemed stuck after a solve or an event switch.
 *   2. A timed-out generation silently pushed a random-move fallback into the
 *      buffer, later served as if it were a WCA scramble.
 *   3. Nothing told a caller which request a result belonged to; the page had
 *      to guard against slow results landing after newer ones itself.
 * Now the buffer holds PROMISES in request order: a caller takes the oldest
 * in-flight generation (never a second one behind it), each promise is
 * consumed exactly once (no scramble can be shown twice), results carry their
 * source, and a caller that gave up waiting returns the pending promise to
 * the front of the buffer so the work is not wasted. Stale-result protection
 * (event/session switches, a slow result landing after a newer request) lives
 * in the timer's scramble feed, which tags every request with a token.
 */

const rand = (n: number) => Math.floor(Math.random() * n);
const QUARTER_HALF = ["", "'", "2"] as const; // quarter or half turn
const QUARTER = ["", "'"] as const; // 120° puzzles (pyraminx/skewb)

/** Where a scramble came from: shown quietly so practice is honest. */
export type ScrambleSource = "wca" | "random" | "manual" | "none";

export type Scramble = { text: string; source: ScrambleSource };

/**
 * NxN cube scramble: pick a turn axis different from the previous one each
 * time, then a face on that axis and a suffix. Never two turns in a row on the
 * same axis (which also rules out redundant same-face repeats).
 */
function nxn(axes: string[][], length: number): string {
  const moves: string[] = [];
  let prevAxis = -1;
  while (moves.length < length) {
    const a = rand(axes.length);
    if (a === prevAxis) continue;
    const face = axes[a][rand(axes[a].length)];
    moves.push(face + QUARTER_HALF[rand(QUARTER_HALF.length)]);
    prevAxis = a;
  }
  return moves.join(" ");
}

// Axis groups per cube size (wider slices added as the cube grows).
const A2 = [["U"], ["R"], ["F"]];
const A3 = [
  ["U", "D"],
  ["L", "R"],
  ["F", "B"],
];
const WIDE = [
  ["U", "D", "Uw", "Dw"],
  ["L", "R", "Lw", "Rw"],
  ["F", "B", "Fw", "Bw"],
];
const WIDER = [
  ["U", "D", "Uw", "Dw", "3Uw", "3Dw"],
  ["L", "R", "Lw", "Rw", "3Lw", "3Rw"],
  ["F", "B", "Fw", "Bw", "3Fw", "3Bw"],
];

function faceTurns(faces: string[], suffixes: readonly string[], length: number): string {
  const moves: string[] = [];
  let last = "";
  while (moves.length < length) {
    const f = faces[rand(faces.length)];
    if (f === last) continue;
    moves.push(f + suffixes[rand(suffixes.length)]);
    last = f;
  }
  return moves.join(" ");
}

/**
 * Blindfolded scrambles end in a random orientation (the solver must not
 * know which way the cube is held), done with wide turns like the WCA's.
 */
function orientation(wide: string): string {
  const pick = (face: string) => {
    const k = rand(4);
    return k === 0 ? "" : face + ["", "'", "2"][k - 1];
  };
  return [pick(wide.replace("?", "R")), pick(wide.replace("?", "U"))].filter(Boolean).join(" ");
}

function pyraminx(): string {
  const body = faceTurns(["U", "L", "R", "B"], QUARTER, 8);
  const tips = ["u", "l", "r", "b"]
    .filter(() => Math.random() < 0.6)
    .map((t) => t + QUARTER[rand(QUARTER.length)]);
  return [body, ...tips].join(" ").trim();
}

function megaminx(): string {
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const parts: string[] = [];
    for (let j = 0; j < 5; j++) {
      parts.push("R" + (Math.random() < 0.5 ? "++" : "--"));
      parts.push("D" + (Math.random() < 0.5 ? "++" : "--"));
    }
    parts.push(Math.random() < 0.5 ? "U" : "U'");
    lines.push(parts.join(" "));
  }
  // Newlines, like the WCA's: the scramble bar shows one row per line.
  return lines.join("\n");
}

function clock(): string {
  const amt = () => {
    const n = rand(12) - 5; // -5..6
    return `${Math.abs(n)}${n < 0 ? "-" : "+"}`;
  };
  const front = ["UR", "DR", "DL", "UL", "U", "R", "D", "L", "ALL"]
    .map((p) => `${p}${amt()}`)
    .join(" ");
  const back = ["U", "R", "D", "L", "ALL"].map((p) => `${p}${amt()}`).join(" ");
  const pins = ["UR", "DR", "DL", "UL"].filter(() => Math.random() < 0.5);
  return `${front} y2 ${back}${pins.length ? " " + pins.join(" ") : ""}`;
}

function square1(): string {
  const parts: string[] = [];
  const n = 12 + rand(6);
  for (let i = 0; i < n; i++) {
    parts.push(`(${rand(13) - 6},${rand(13) - 6})`);
  }
  return parts.join("/");
}

/** FMC scrambles start and end with R' U' F (WCA), so the solver can't cheat a skip. */
function fmc(): string {
  return `R' U' F ${nxn(A3, 19)} R' U' F`;
}

/** A dependency-free random-move scramble: the fallback for each event. */
export function randomScramble(eventId: string): string {
  switch (eventId) {
    case "222":
      return nxn(A2, 11);
    case "333":
    case "333oh":
      return nxn(A3, 20);
    case "333bf":
      return `${nxn(A3, 20)} ${orientation("?w")}`.trim();
    case "333fm":
      return fmc();
    case "444":
      return nxn(WIDE, 45);
    case "444bf":
      return `${nxn(WIDE, 45)} ${orientation("3?w")}`.trim();
    case "555":
      return nxn(WIDE, 60);
    case "555bf":
      return `${nxn(WIDE, 60)} ${orientation("3?w")}`.trim();
    case "666":
      return nxn(WIDER, 80);
    case "777":
      return nxn(WIDER, 100);
    case "pyram":
      return pyraminx();
    case "skewb":
      return faceTurns(["U", "R", "L", "B"], QUARTER, 9);
    case "minx":
      return megaminx();
    case "clock":
      return clock();
    case "sq1":
      return square1();
    case "none":
      return "";
    default:
      return nxn(A3, 20);
  }
}

// ---- real WCA scrambles (cubing.js), lazy-loaded and buffered ----

/** Our event ids → cubing.js event ids. */
const CUBING_EVENT: Record<string, string> = {
  "333": "333",
  "222": "222",
  "444": "444",
  "555": "555",
  "666": "666",
  "777": "777",
  "333oh": "333oh",
  "333bf": "333bf",
  "333fm": "333fm",
  "444bf": "444bf",
  "555bf": "555bf",
  pyram: "pyram",
  skewb: "skewb",
  minx: "minx",
  clock: "clock",
  sq1: "sq1",
};

/** True when cubing.js can generate a real WCA scramble for this event. */
export function hasWcaScrambler(eventId: string): boolean {
  return eventId in CUBING_EVENT;
}

/** A generation that never settles must not hold the buffer forever. */
const GENERATION_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("scramble timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/**
 * Start loading cubing.js's scrambler now (module + worker), without asking
 * for a scramble. Safe to call repeatedly.
 */
let loader: Promise<typeof import("cubing/scramble")> | null = null;
function loadScrambler(): Promise<typeof import("cubing/scramble")> {
  loader ??= import("cubing/scramble").catch((err) => {
    loader = null; // let a later call retry (e.g. a flaky network on first load)
    throw err;
  });
  return loader;
}
export function warmScrambler(): void {
  loadScrambler().catch(() => {
    /* the fallback covers it; a later request retries */
  });
}

/** Generate one scramble; falls back to random moves on any failure. */
async function generateOne(eventId: string): Promise<Scramble> {
  if (eventId === "none") return { text: "", source: "none" };
  const cubingId = CUBING_EVENT[eventId];
  if (!cubingId) return { text: randomScramble(eventId), source: "random" };
  try {
    const { randomScrambleForEvent } = await loadScrambler();
    const alg = await withTimeout(randomScrambleForEvent(cubingId), GENERATION_TIMEOUT_MS);
    const text = alg.toString().trim();
    if (!text) throw new Error("empty scramble");
    return { text, source: "wca" };
  } catch {
    return { text: randomScramble(eventId), source: "random" };
  }
}

/**
 * A per-event FIFO of in-flight (or finished) generations. Exported for the
 * unit test, which drives it with a fake generator; the app uses the
 * module-level instance below.
 */
export class ScrambleBuffer {
  private readonly queues = new Map<string, Promise<Scramble>[]>();
  private readonly generate: (eventId: string) => Promise<Scramble>;
  private readonly depth: number;

  constructor(generate: (eventId: string) => Promise<Scramble>, depth = 2) {
    this.generate = generate;
    this.depth = depth;
  }

  private queue(eventId: string): Promise<Scramble>[] {
    let q = this.queues.get(eventId);
    if (!q) {
      q = [];
      this.queues.set(eventId, q);
    }
    return q;
  }

  /** Keep `depth` generations queued for this event. */
  prefetch(eventId: string): void {
    const q = this.queue(eventId);
    while (q.length < this.depth) q.push(this.generate(eventId));
  }

  /** The oldest queued generation (or a fresh one), then top the queue up. */
  take(eventId: string): Promise<Scramble> {
    const q = this.queue(eventId);
    const next = q.shift() ?? this.generate(eventId);
    this.prefetch(eventId);
    return next;
  }

  /** Give back a generation the caller stopped waiting for: it is next in line. */
  giveBack(eventId: string, pending: Promise<Scramble>): void {
    this.queue(eventId).unshift(pending);
  }

  /** queued generations for an event (for tests) */
  size(eventId: string): number {
    return this.queue(eventId).length;
  }

  /**
   * Take the next scramble, but never wait longer than `fallbackAfterMs`: past
   * that, resolve with a random-move scramble for THIS solve and put the
   * pending real one back at the front for the next.
   */
  takeWithin(
    eventId: string,
    fallbackAfterMs: number,
    fallback: (eventId: string) => Scramble,
  ): Promise<Scramble> {
    const pending = this.take(eventId);
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.giveBack(eventId, pending);
        resolve(fallback(eventId));
      }, fallbackAfterMs);
      pending.then((s) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(s);
      });
    });
  }
}

const buffer = new ScrambleBuffer(generateOne, 2);

/** How long the timer waits for a real scramble before using a random-move one. */
export const SCRAMBLE_FALLBACK_MS = 2500;

/**
 * Next scramble for the timer: a real WCA one when it arrives within
 * `fallbackAfterMs`, otherwise a labelled random-move one (and the real one is
 * kept for the next solve).
 */
export function takeScramble(
  eventId: string,
  fallbackAfterMs = SCRAMBLE_FALLBACK_MS,
): Promise<Scramble> {
  if (eventId === "none") return Promise.resolve({ text: "", source: "none" });
  if (!hasWcaScrambler(eventId)) {
    return Promise.resolve({ text: randomScramble(eventId), source: "random" });
  }
  return buffer.takeWithin(eventId, fallbackAfterMs, (ev) => ({
    text: randomScramble(ev),
    source: "random",
  }));
}

/** Next real WCA scramble for an event (waits as long as it takes). */
export async function wcaScramble(eventId: string): Promise<string> {
  if (!hasWcaScrambler(eventId)) return randomScramble(eventId);
  return (await buffer.take(eventId)).text;
}

/** Warm an event's buffer (call on mount and when switching puzzles). */
export function prefetchScrambles(eventId: string): void {
  if (hasWcaScrambler(eventId)) buffer.prefetch(eventId);
}

/** Event ids the practice timer can generate scrambles for. */
export const PRACTICE_EVENT_IDS = [
  "333",
  "222",
  "444",
  "555",
  "666",
  "777",
  "333oh",
  "333bf",
  "444bf",
  "555bf",
  "333fm",
  "clock",
  "minx",
  "pyram",
  "skewb",
  "sq1",
] as const;
