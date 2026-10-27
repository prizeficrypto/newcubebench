/**
 * Optimal cross solver (3x3), csTimer's "cross" tool, written from scratch.
 *
 * Only the 12 edges matter for a cross. Each face's cross is its 4 edges in
 * their home slots, correctly oriented. For each face we build, once and
 * lazily, an exact distance table over every placement of those 4 edges
 * (24^4 encodings, 190,080 reachable) by breadth-first search from solved.
 * Solving is then a greedy walk down the table — every step reduces the
 * distance by one — so the solution is optimal (fewest face turns, HTM) and
 * instant. Solutions are in the scramble's orientation: "the U cross is
 * F R2 D'" means do exactly those turns while holding the cube as scrambled.
 *
 * Edge slots (Kociemba order): UR UF UL UB DR DF DL DB FR FL BL BR.
 */

export type Face = "U" | "D" | "F" | "B" | "R" | "L";
export const FACES: Face[] = ["D", "U", "F", "B", "R", "L"];

/** Each face's cross edges (slot indices). */
const CROSS_EDGES: Record<Face, number[]> = {
  U: [0, 1, 2, 3],
  D: [4, 5, 6, 7],
  F: [1, 5, 8, 9],
  B: [3, 7, 10, 11],
  R: [0, 4, 8, 11],
  L: [2, 6, 9, 10],
};

// Quarter turns as "slot i receives the piece from slot from[i]", plus the
// orientation flip a piece picks up arriving at slot i (only F and B flip).
const QUARTER: Record<Face, { from: number[]; flip: number[] }> = {
  U: { from: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], flip: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  D: { from: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], flip: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  R: { from: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], flip: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  L: { from: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], flip: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  F: { from: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], flip: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
  B: { from: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], flip: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
};

type Move = { name: string; face: Face; dest: number[]; flip: number[] };

/** Where a piece in each slot goes, and its flip, for one quarter turn. */
function quarterDest(f: Face): { dest: number[]; flip: number[] } {
  const { from, flip } = QUARTER[f];
  const dest = new Array<number>(12);
  const fl = new Array<number>(12);
  from.forEach((src, i) => {
    dest[src] = i;
    fl[src] = flip[i];
  });
  return { dest, flip: fl };
}

/**
 * All 18 face turns (X, X2, X'), as slot→slot maps with flips. A turn of k
 * quarters walks each piece k steps, collecting the flips along the way.
 */
const MOVES: Move[] = (["U", "D", "F", "B", "R", "L"] as Face[]).flatMap((f) => {
  const q = quarterDest(f);
  return [1, 2, 3].map((turns) => {
    const dest: number[] = [];
    const flip: number[] = [];
    for (let slot = 0; slot < 12; slot++) {
      let at = slot;
      let fl = 0;
      for (let k = 0; k < turns; k++) {
        fl ^= q.flip[at];
        at = q.dest[at];
      }
      dest.push(at);
      flip.push(fl);
    }
    return { name: f + (turns === 1 ? "" : turns === 2 ? "2" : "'"), face: f, dest, flip };
  });
});

/** A whole-edge state: piece → slot and piece → orientation (0/1). */
type Edges = { slot: number[]; ori: number[] };

const solvedEdges = (): Edges => ({ slot: [...Array(12).keys()], ori: new Array(12).fill(0) });

function applyMove(e: Edges, m: Move): Edges {
  return {
    slot: e.slot.map((s) => m.dest[s]),
    ori: e.ori.map((o, piece) => o ^ m.flip[e.slot[piece]]),
  };
}

const BY_NAME = new Map(MOVES.map((m) => [m.name, m]));

/**
 * Apply a scramble's face turns. Returns null for anything that isn't a plain
 * 3x3 face-turn sequence (wide moves, slices, rotations), which this solver
 * can't express.
 */
export function edgesAfter(scramble: string): Edges | null {
  let e = solvedEdges();
  for (const tok of scramble.trim().split(/\s+/).filter(Boolean)) {
    const m = BY_NAME.get(tok.replace("’", "'"));
    if (!m) return null;
    e = applyMove(e, m);
  }
  return e;
}

// ---------- per-face distance tables ----------

const SIZE = 24 ** 4;
const tables = new Map<Face, Uint8Array>();

function encode(pieces: number[], e: Edges): number {
  let code = 0;
  for (let k = 3; k >= 0; k--) code = code * 24 + e.slot[pieces[k]] * 2 + e.ori[pieces[k]];
  return code;
}

/** Next code after a move, from a code (for the BFS, without full states). */
function stepCode(code: number, m: Move): number {
  let out = 0;
  let mul = 1;
  for (let k = 0; k < 4; k++) {
    const v = code % 24;
    code = (code - v) / 24;
    const slot = v >> 1;
    const ori = (v & 1) ^ m.flip[slot];
    out += (m.dest[slot] * 2 + ori) * mul;
    mul *= 24;
  }
  return out;
}

function table(face: Face): Uint8Array {
  let t = tables.get(face);
  if (t) return t;
  t = new Uint8Array(SIZE).fill(255);
  const start = encode(CROSS_EDGES[face], solvedEdges());
  const queue = new Int32Array(200_000);
  let head = 0;
  let tail = 0;
  t[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++];
    const d = t[c];
    for (const m of MOVES) {
      const n = stepCode(c, m);
      if (t[n] === 255) {
        t[n] = d + 1;
        queue[tail++] = n;
      }
    }
  }
  tables.set(face, t);
  return t;
}

/** Fewest-move solution for one face's cross (empty when already solved). */
export function solveCross(e: Edges, face: Face): string[] {
  const t = table(face);
  let code = encode(CROSS_EDGES[face], e);
  const moves: string[] = [];
  let last = "";
  while (t[code] > 0) {
    const d = t[code];
    // (an optimal path never turns the same face twice in a row)
    const m =
      MOVES.find((x) => x.face !== last && t[stepCode(code, x)] === d - 1) ??
      MOVES.find((x) => t[stepCode(code, x)] === d - 1)!;
    moves.push(m.name);
    last = m.face;
    code = stepCode(code, m);
  }
  return moves;
}

/** Optimal crosses for all six faces of a scramble, or null if unsupported. */
export function crossSolutions(scramble: string): { face: Face; moves: string[] }[] | null {
  const e = edgesAfter(scramble);
  if (!e) return null;
  return FACES.map((face) => ({ face, moves: solveCross(e, face) }));
}
