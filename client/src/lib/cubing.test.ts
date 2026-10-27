/**
 * Plain-node assertions for the cubing math. Run: `node src/lib/cubing.test.ts`
 * (Node strips the TS types.) No test framework — keep it dependency-free.
 */
import assert from "node:assert/strict";
import {
  attemptCs,
  attemptEffectiveMs,
  bestSingleCs,
  missedCutoff,
  placeResult,
  formatAttempt,
  formatCentiseconds,
  formatMs,
  madeTheCut,
  msToCentiseconds,
  ordinal,
  placeAverage,
  stageBreakdown,
  wcaAo5Cs,
  wcaAo5FromAttempts,
  wcaAo5Ms,
  wcaAverageCs,
  wcaAverageFromAttempts,
  type Attempt,
  type Solve,
} from "./cubing.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- WCA Ao5: drop one best + one worst, mean the middle three ---
check("Ao5 drops single best and single worst", () => {
  // sorted: 40,45,50,55,60 -> middle 45,50,55 -> 50
  assert.equal(wcaAo5Ms([5000, 4000, 6000, 4500, 5500]), 5000);
});
check("Ao5 is not a plain mean", () => {
  const times = [1000, 2000, 3000, 4000, 100000];
  const plainMean = times.reduce((a, b) => a + b) / 5; // 22000
  assert.notEqual(wcaAo5Ms(times), plainMean);
  assert.equal(wcaAo5Ms(times), 3000); // mean of 2000,3000,4000
});
check("Ao5 removes only ONE best/worst when tied", () => {
  // sorted: 3000,4000,4000,4000,5000 -> middle 4000,4000,4000 -> 4000
  assert.equal(wcaAo5Ms([4000, 4000, 4000, 5000, 3000]), 4000);
});
check("Ao5 rejects wrong count", () => {
  assert.throws(() => wcaAo5Ms([1, 2, 3, 4]));
});

// --- +2 penalty model ---
check("+2 adds exactly 2s to that attempt", () => {
  const a: Attempt = { rawMs: 12340, plus2: true };
  assert.equal(attemptEffectiveMs(a), 14340);
  assert.equal(attemptCs(a), 1434);
  assert.equal(attemptEffectiveMs({ rawMs: 12340, plus2: false }), 12340);
});
check("+2 display shows final time with trailing plus (14.34+)", () => {
  assert.equal(formatAttempt({ rawMs: 12340, plus2: true }), "14.34+");
  assert.equal(formatAttempt({ rawMs: 12340, plus2: false }), "12.34");
});
check("+2 applies BEFORE best/worst selection and averaging", () => {
  // raw: 10,11,12,13,14s; +2 on the 10s solve makes it 12s — no longer best.
  const attempts: Attempt[] = [
    { rawMs: 10000, plus2: true }, // 12.00 effective
    { rawMs: 11000, plus2: false },
    { rawMs: 12000, plus2: false },
    { rawMs: 13000, plus2: false },
    { rawMs: 14000, plus2: false },
  ];
  const cs = attempts.map(attemptCs); // [1200,1100,1200,1300,1400]
  // drop best 1100 and worst 1400 -> mean(1200,1200,1300) = 1233.33 -> 1233
  assert.equal(wcaAo5Cs(cs), 1233);
});
check("+2 that lands on the worst attempt is dropped like any worst", () => {
  const attempts: Attempt[] = [
    { rawMs: 20000, plus2: true }, // 22.00 -> worst, dropped
    { rawMs: 11000, plus2: false },
    { rawMs: 12000, plus2: false },
    { rawMs: 13000, plus2: false },
    { rawMs: 10000, plus2: false }, // best, dropped
  ];
  assert.equal(wcaAo5Cs(attempts.map(attemptCs)), 1200);
});

// --- DNF-aware Ao5 (WCA: one DNF = worst; two+ DNFs = DNF average) ---
const t = (s: number, plus2 = false, dnf = false): Attempt => ({
  rawMs: s * 1000,
  plus2,
  dnf,
});
check("no DNFs: same result as the cs pipeline", () => {
  const attempts = [t(10), t(11), t(12), t(13), t(14)];
  assert.equal(wcaAo5FromAttempts(attempts), 1200);
});
check("one DNF counts as the worst and is dropped", () => {
  // real times 10,11,12,13 + DNF -> drop DNF (worst) and 10 (best) -> mean(11,12,13)
  const attempts = [t(10), t(11), t(12, false, true), t(12), t(13)];
  assert.equal(wcaAo5FromAttempts(attempts), 1200);
});
check("two DNFs make the average DNF (null)", () => {
  const attempts = [t(10), t(11, false, true), t(12), t(13, false, true), t(9)];
  assert.equal(wcaAo5FromAttempts(attempts), null);
});
check("a +2 on a kept attempt still applies with a DNF in the set", () => {
  // DNF dropped as worst; times 10,11+2=13,12, drop best 10 -> mean(13,12, 13) wait:
  // real: 10, 13(11+2), 12, 13 -> drop best 10 -> mean(13,12,13) = 12.67
  const attempts = [t(10), t(11, true), t(12), t(13), t(14, false, true)];
  assert.equal(wcaAo5FromAttempts(attempts), 1267);
});
check("DNF attempt displays as DNF", () => {
  assert.equal(formatAttempt(t(12.34, false, true)), "DNF");
  assert.equal(formatAttempt(t(12.34, true, true)), "DNF");
});
check("DNF-aware Ao5 rejects wrong count", () => {
  assert.throws(() => wcaAo5FromAttempts([t(1), t(2)]));
});

// --- Mean of 3 (WCA: mean all three; ANY DNF => DNF; no dropping) ---
check("Mo3 is the mean of all three (nothing dropped)", () => {
  // 10,12,14 -> mean 12.00; the best/worst are NOT dropped
  const attempts = [t(10), t(12), t(14)];
  assert.equal(wcaAverageFromAttempts(attempts, "mo3"), 1200);
});
check("Mo3 with any DNF is DNF (null)", () => {
  const attempts = [t(10), t(12, false, true), t(14)];
  assert.equal(wcaAverageFromAttempts(attempts, "mo3"), null);
});
check("Mo3 applies +2 before averaging", () => {
  // 10, 12(=10+2), 14 -> mean(10,12,14) = 12.00
  const attempts = [t(10), t(10, true), t(14)];
  assert.equal(wcaAverageFromAttempts(attempts, "mo3"), 1200);
});
check("Mo3 rejects wrong count", () => {
  assert.throws(() => wcaAverageFromAttempts([t(1), t(2)], "mo3"));
});
check("wcaAverageCs means all three cs values for mo3", () => {
  // (1000+1200+1401)/3 = 1200.33 -> 1200
  assert.equal(wcaAverageCs([1000, 1200, 1401], "mo3"), 1200);
});
check("wcaAverageFromAttempts delegates to Ao5 for ao5", () => {
  const attempts = [t(10), t(11), t(12), t(13), t(14)];
  assert.equal(wcaAverageFromAttempts(attempts, "ao5"), 1200);
  assert.equal(wcaAverageCs([1000, 1100, 1200, 1300, 1400], "ao5"), 1200);
});
check("wcaAverageCs rejects a non-3 mo3 input", () => {
  assert.throws(() => wcaAverageCs([1000, 1200], "mo3"));
});

// --- cs-domain Ao5 consistency (average agrees with displayed attempts) ---
check("Ao5 is computed from cs-quantized attempts, like official results", () => {
  // ms values whose displayed cs are 10.01, 10.00, 10.00 (+ dropped 9 & 11):
  const attempts: Attempt[] = [
    { rawMs: 10014, plus2: false }, // shows 10.01
    { rawMs: 10004, plus2: false }, // shows 10.00
    { rawMs: 10004, plus2: false }, // shows 10.00
    { rawMs: 9000, plus2: false },
    { rawMs: 11000, plus2: false },
  ];
  // WCA-faithful: (1001+1000+1000)/3 = 1000.33 -> 1000 -> "10.00"
  assert.equal(wcaAo5Cs(attempts.map(attemptCs)), 1000);
  assert.equal(formatCentiseconds(1000), "10.00");
});

// --- rounding to centiseconds (WCA unit) ---
check("ms -> centiseconds rounds to nearest", () => {
  assert.equal(msToCentiseconds(12432), 1243);
  assert.equal(msToCentiseconds(12435), 1244); // .5 rounds up
});

// --- formatting ---
check("formats sub-minute and minute-plus times", () => {
  assert.equal(formatCentiseconds(1243), "12.43");
  assert.equal(formatCentiseconds(586), "5.86");
  assert.equal(formatCentiseconds(10779), "1:47.79");
  assert.equal(formatCentiseconds(6000), "1:00.00");
});
check("formatMs matches the cs formatter after quantization", () => {
  assert.equal(formatMs(12432), "12.43");
  assert.equal(formatMs(0), "0.00");
  assert.equal(formatMs(65432), "1:05.43");
});
check("ordinals", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(8), "8th");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(42), "42nd");
});

// --- placement (WCA ordering; DNFs counted in total, sort last) ---
check("placement counts strictly-faster valid averages, +1", () => {
  const asc = [1000, 1200, 1243, 1300];
  // 2 strictly faster than 1243 -> 3rd; total includes a DNF competitor
  assert.deepEqual(placeAverage(1243, asc, 5), { placement: 3, total: 5 });
});
check("fastest-of-field places 1st; total is everyone", () => {
  assert.deepEqual(placeAverage(500, [586, 600], 42), { placement: 1, total: 42 });
});
check("all-DNF field: no valid averages, user places 1st of total", () => {
  assert.deepEqual(placeAverage(1243, [], 7), { placement: 1, total: 7 });
});

// --- advancement cut boundary (top N advance) ---
check("made the cut exactly at the boundary, missed one past it", () => {
  assert.equal(madeTheCut(382, 382), true); // last qualifying spot
  assert.equal(madeTheCut(383, 382), false); // first one out
  assert.equal(madeTheCut(1, 16), true);
  assert.equal(madeTheCut(17, 16), false);
});

// --- stage breakdown: sum each stage, largest share ---
check("stage breakdown finds the slowest stage and its share", () => {
  const mk = (c: number, f: number, o: number, p: number): Solve => ({
    stages: { cross: c, f2l: f, oll: o, pll: p },
    totalMs: c + f + o + p,
  });
  const solves = [mk(1000, 2000, 500, 500), mk(1000, 2000, 500, 500)];
  const b = stageBreakdown(solves);
  assert.equal(b.slowest, "f2l");
  assert.equal(b.totals.f2l, 4000);
  assert.equal(b.grandTotalMs, 8000);
  assert.equal(Math.round(b.slowestShare * 100), 50);
});

// ---------- WCA truncation, 10-minute rules, tie-breaks (Regulations 9f1, 9f2, 9f14, 9f15) ----------

const at = (rawMs: number, plus2 = false, dnf = false): Attempt => ({ rawMs, plus2, dnf });

check("attempts truncate to the hundredth, never round up (9f1)", () => {
  assert.equal(attemptCs(at(7995.6)), 799);
  assert.equal(attemptCs(at(12349)), 1234);
  assert.equal(attemptCs(at(12340, true)), 1434);
});

check("attempts of 10:00.00 and over truncate to whole seconds (9f2)", () => {
  assert.equal(attemptCs(at(628_888)), 62_800);
  assert.equal(attemptCs(at(599_999)), 59_999);
});

check("means of 10 minutes and over round to the second (9f2)", () => {
  // 10:23.456, 10:30.123, 10:28.888 → 10:23, 10:30, 10:28 → mean 10:27.00
  const mean = wcaAverageFromAttempts([at(623_456), at(630_123), at(628_888)], "mo3");
  assert.equal(mean, 62_700);
});

check("the bug-hunt case: truncation turns an 8.00 average into 7.99", () => {
  const a = [at(5004.6), at(7995.6), at(7995.6), at(8004.6), at(9000)];
  assert.equal(wcaAo5FromAttempts(a), 799);
});

const field = [
  { averageCs: 798, bestCs: 600 },
  { averageCs: 799, bestCs: 566 },
  { averageCs: 799, bestCs: 636 },
  { averageCs: 799, bestCs: 734 },
  { averageCs: 799, bestCs: 739 },
  { averageCs: 800, bestCs: 700 },
  { averageCs: null, bestCs: 650 },
  { averageCs: null, bestCs: null },
];

check("equal averages are broken by best single (9f14)", () => {
  // average 7.99 with best 7.99: behind all four 7.99s (their bests are faster)
  assert.deepEqual(placeResult({ averageCs: 799, bestCs: 799 }, field), { placement: 6, total: 9 });
  // average 7.99 with best 6.00: ahead of three of them
  assert.deepEqual(placeResult({ averageCs: 799, bestCs: 600 }, field), { placement: 3, total: 9 });
});

check("an identical average and best shares the position (9f15)", () => {
  assert.deepEqual(placeResult({ averageCs: 799, bestCs: 636 }, field).placement, 3);
});

check("a DNF average places after every valid average, by best single", () => {
  assert.deepEqual(placeResult({ averageCs: null, bestCs: 700 }, field), { placement: 8, total: 9 });
  assert.deepEqual(placeResult({ averageCs: null, bestCs: 600 }, field).placement, 7);
  assert.deepEqual(placeResult({ averageCs: null, bestCs: null }, field).placement, 8);
});

check("the user counts in the field (no more '17th of 16')", () => {
  const sixteen = Array.from({ length: 16 }, (_, i) => ({ averageCs: 700 + i, bestCs: 600 }));
  assert.deepEqual(placeResult({ averageCs: 900, bestCs: 800 }, sixteen), { placement: 17, total: 17 });
});

check("bestSingleCs ignores DNFs", () => {
  assert.equal(bestSingleCs([at(9000, false, true), at(10_000), at(8_000, true)]), 1000);
  assert.equal(bestSingleCs([at(9000, false, true)]), null);
});

check("cutoff: one of the first N attempts must be strictly under it (9g)", () => {
  const six = { numberOfAttempts: 1, attemptResultCs: 18_000 }; // WC2023 6x6: under 3:00.00
  assert.equal(missedCutoff([at(185_000)], six), true);
  assert.equal(missedCutoff([at(179_990)], six), false);
  assert.equal(missedCutoff([at(180_000)], six), true); // exactly 3:00.00 is not under
  assert.equal(missedCutoff([at(170_000, false, true)], six), true); // a DNF never makes it
  assert.equal(missedCutoff([at(178_500, true)], six), true); // +2 counts: 3:00.50
  const pyram = { numberOfAttempts: 2, attemptResultCs: 2000 };
  assert.equal(missedCutoff([at(25_000)], pyram), false); // not decided until 2 attempts
  assert.equal(missedCutoff([at(25_000), at(19_000)], pyram), false);
  assert.equal(missedCutoff([at(25_000), at(21_000)], pyram), true);
});

console.log(`\n${passed} checks passed.`);
