/**
 * Practice scrambles for the standalone Timer.
 *
 * Real WCA scrambles come from cubing.js (`randomScrambleForEvent`) — the same
 * random-state generator the WCA uses (via TNoodle) for 2x2-5x5, Pyraminx,
 * Skewb, Clock and Square-1, and constrained random moves for 6x6/7x7/Megaminx.
 * It is loaded lazily (WASM worker) and buffered so switching solves is snappy.
 *
 * If generation ever fails (worker/WASM unavailable), we fall back to a
 * dependency-free random-move scramble so the timer still works — degraded,
 * never broken.
 */

const rand = (n: number) => Math.floor(Math.random() * n);
const QUARTER_HALF = ["", "'", "2"] as const; // quarter or half turn
const QUARTER = ["", "'"] as const; // 120° puzzles (pyraminx/skewb)

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
  return lines.join("   ");
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

/** A dependency-free random-move scramble — the fallback for each event. */
export function randomScramble(eventId: string): string {
  switch (eventId) {
    case "222":
      return nxn(A2, 11);
    case "333":
    case "333oh":
      return nxn(A3, 20);
    case "444":
      return nxn(WIDE, 45);
    case "555":
      return nxn(WIDE, 60);
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
  "333oh": "333",
  pyram: "pyram",
  skewb: "skewb",
  minx: "minx",
  clock: "clock",
  sq1: "sq1",
};

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

/** Generate one real WCA scramble; fall back to random moves on any failure. */
async function generateOne(eventId: string): Promise<string> {
  const cubingId = CUBING_EVENT[eventId] ?? "333";
  try {
    const { randomScrambleForEvent } = await import("cubing/scramble");
    const alg = await withTimeout(randomScrambleForEvent(cubingId), 15_000);
    const scramble = alg.toString().trim();
    if (!scramble) throw new Error("empty scramble");
    return scramble;
  } catch {
    return randomScramble(eventId);
  }
}

const QUEUE: Record<string, string[]> = {};
const FILLING: Record<string, boolean> = {};
const MAX_QUEUE = 2;

/** Keep each event's buffer topped up in the background. */
function refill(eventId: string): void {
  const q = (QUEUE[eventId] ??= []);
  if (q.length >= MAX_QUEUE || FILLING[eventId]) return;
  FILLING[eventId] = true;
  generateOne(eventId)
    .then((s) => {
      (QUEUE[eventId] ??= []).push(s);
    })
    .finally(() => {
      FILLING[eventId] = false;
      refill(eventId);
    });
}

/** Next real WCA scramble for an event. Uses the buffer when warm. */
export async function wcaScramble(eventId: string): Promise<string> {
  const q = (QUEUE[eventId] ??= []);
  const next = q.shift();
  refill(eventId);
  return next ?? generateOne(eventId);
}

/** Warm an event's buffer (call on mount and when switching puzzles). */
export function prefetchScrambles(eventId: string): void {
  refill(eventId);
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
  "pyram",
  "skewb",
  "minx",
  "clock",
  "sq1",
] as const;
