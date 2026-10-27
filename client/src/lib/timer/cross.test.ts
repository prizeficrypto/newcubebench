/**
 * Cross solver tests. Run: node src/lib/timer/cross.test.ts
 *
 * Correctness is checked against an INDEPENDENT cube model — cubing.js's
 * kpuzzle — not our own edge tables: apply scramble + solution there and
 * confirm that face's four cross edges are home and oriented. Optimality is
 * checked against a brute-force iterative-deepening search.
 */
import assert from "node:assert/strict";
import { cube3x3x3 } from "cubing/puzzles";
import { crossSolutions, edgesAfter, solveCross, type Face } from "./cross.ts";

const kpuzzle = await cube3x3x3.kpuzzle();
// cubing.js edge order: UF UR UB UL DF DR DB DL FR FL BR BL
const KP_CROSS: Record<Face, number[]> = {
  U: [0, 1, 2, 3],
  D: [4, 5, 6, 7],
  F: [0, 4, 8, 9],
  B: [2, 6, 10, 11],
  R: [1, 5, 8, 10],
  L: [3, 7, 9, 11],
};

function crossSolvedByCubing(alg: string, face: Face): boolean {
  const e = kpuzzle.defaultPattern().applyAlg(alg).patternData.EDGES;
  return KP_CROSS[face].every((i) => e.pieces[i] === i && e.orientation[i] === 0);
}

let seed = 12345;
const rnd = (n: number) => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed % n;
};
const FACE_NAMES = ["U", "D", "F", "B", "R", "L"];
const SUFFIX = ["", "2", "'"];
function randomScramble(len: number): string {
  const out: string[] = [];
  let last = -1;
  while (out.length < len) {
    const f = rnd(6);
    if (f === last) continue;
    last = f;
    out.push(FACE_NAMES[f] + SUFFIX[rnd(3)]);
  }
  return out.join(" ");
}

let n = 0;
const ok = (name: string) => {
  n++;
  console.log(`ok - ${name}`);
};

// 1) Every solution solves its cross (independent referee), in ≤ 8 moves.
for (let i = 0; i < 200; i++) {
  const scr = randomScramble(25);
  for (const { face, moves } of crossSolutions(scr)!) {
    assert.ok(moves.length <= 8, `${face} cross took ${moves.length} moves`);
    assert.ok(crossSolvedByCubing(`${scr} ${moves.join(" ")}`, face), `${face}: ${scr} | ${moves.join(" ")}`);
  }
}
ok("200 random scrambles × 6 faces: every solution solves its cross (checked by cubing.js), ≤ 8 moves");

// 2) Optimal: no shorter solution exists (brute force up to the found length).
const ALL = FACE_NAMES.flatMap((f) => SUFFIX.map((s) => f + s));
function shortest(scr: string, face: Face, max: number): number {
  for (let depth = 0; depth <= max; depth++) {
    const found = (prefix: string[], lastFace: string): boolean => {
      if (prefix.length === depth) return crossSolvedByCubing(`${scr} ${prefix.join(" ")}`, face);
      return ALL.some((m) => m[0] !== lastFace && found([...prefix, m], m[0]));
    };
    if (found([], "")) return depth;
  }
  return Infinity;
}
for (let i = 0; i < 12; i++) {
  const scr = randomScramble(4); // short scrambles keep brute force fast
  const face = (["D", "U", "F"] as Face[])[i % 3];
  const ours = solveCross(edgesAfter(scr)!, face).length;
  assert.equal(ours, shortest(scr, face, ours), `not optimal for ${face}: ${scr}`);
}
ok("solutions are optimal (matches brute force on 12 cases)");

// 3) Edge cases.
assert.deepEqual(crossSolutions("")!.map((c) => c.moves.length), [0, 0, 0, 0, 0, 0]);
assert.deepEqual(solveCross(edgesAfter("D")!, "D"), ["D'"]);
assert.equal(crossSolutions("Rw U R"), null); // wide moves aren't supported
assert.equal(crossSolutions("R U R’ U’")!.length, 6); // typographic apostrophes are fine
ok("solved cube, single turns, unsupported moves, typographic primes");

console.log(`\n${n} checks passed`);
