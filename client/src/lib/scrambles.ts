/**
 * Practice scrambles for the standalone Timer.
 *
 * These are random-MOVE 3x3 scrambles generated in plain JS: 20 moves, no two
 * consecutive turns on the same face, and never three turns in a row on one
 * axis. That's the standard, indistinguishable-in-practice scramble a casual
 * timer uses.
 *
 * Why not cubing.js random-STATE scrambles here? Its WASM solver runs in a web
 * worker that fails to instantiate in some production bundles ("module worker
 * instantiation failed"), which broke this page. The Simulator — the part that
 * benchmarks you against a real competition — uses the competition's actual
 * official scrambles from the WCA, so scramble quality there is unaffected.
 * For free-form practice, random-move is perfectly fine and always works.
 */

const FACES = ["U", "D", "L", "R", "F", "B"] as const;
const AXIS: Record<string, number> = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
const SUFFIX = ["", "'", "2"] as const;
const SCRAMBLE_LENGTH = 20;

function scramble333(length = SCRAMBLE_LENGTH): string {
  const moves: string[] = [];
  let last: string | null = null; // previous face
  let beforeLast: string | null = null; // face before that
  while (moves.length < length) {
    const face = FACES[Math.floor(Math.random() * FACES.length)];
    // No immediate repeat of the same face (U then U is redundant).
    if (face === last) continue;
    // No three turns in a row on the same axis (e.g. U D U).
    if (
      last !== null &&
      beforeLast !== null &&
      AXIS[face] === AXIS[last] &&
      AXIS[last] === AXIS[beforeLast]
    ) {
      continue;
    }
    moves.push(face + SUFFIX[Math.floor(Math.random() * SUFFIX.length)]);
    beforeLast = last;
    last = face;
  }
  return moves.join(" ");
}

const queue: string[] = [];

function topUp(): void {
  if (queue.length > 0) return;
  queue.push(scramble333());
}

/** Get the next scramble (async to keep the call site's contract stable). */
export async function nextScramble(): Promise<string> {
  const next = queue.shift() ?? scramble333();
  topUp();
  return next;
}

/** Prime the buffer (call on page mount). */
export function warmUp(): void {
  topUp();
}
