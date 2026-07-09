/**
 * Practice scrambles for the standalone Timer, generated in plain JS
 * (random-move, no WASM worker). Good enough and always-works for free-form
 * practice; the Simulator uses real official WCA scrambles for benchmarking.
 *
 * Supported here: 2x2-7x7, 3x3 One-Handed (3x3 scramble), Pyraminx, Skewb,
 * Megaminx. Blindfolded, Fewest-Moves, Clock and Square-1 aren't offered in
 * the practice timer yet.
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
  // Random tips (each corner may or may not be turned).
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

/** A random-move scramble for the given event id. Falls back to 3x3. */
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
    default:
      return nxn(A3, 20);
  }
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
] as const;

// ---- backward-compatible 3x3 helpers (still used by the current Timer) ----

const queue: string[] = [];

function topUp(): void {
  if (queue.length === 0) queue.push(randomScramble("333"));
}

/** Next 3x3 scramble (async to keep the existing call site's contract). */
export async function nextScramble(): Promise<string> {
  const next = queue.shift() ?? randomScramble("333");
  topUp();
  return next;
}

/** Prime the buffer (call on page mount). */
export function warmUp(): void {
  topUp();
}
