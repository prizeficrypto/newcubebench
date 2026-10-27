/**
 * Practice-stat tests. Run: node src/lib/timer/stats.test.ts
 * (Node strips the types natively; no test runner needed.)
 */
import assert from "node:assert/strict";
import { formatSolve, formatStat, formatTime } from "./format.ts";
import type { Penalty, TimerSolve } from "./model.ts";
import {
  averageOf,
  parseIndicator,
  rollingSeries,
  roundAverage,
  sessionStats,
  solveValue,
  trimCount,
} from "./stats.ts";

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok - ${name}`);
}

const solve = (ms: number, penalty: Penalty = 0): TimerSolve => ({
  id: String(Math.random()),
  ms,
  penalty,
  scramble: "",
  at: 0,
});
const D = Infinity;

test("formatTime truncates, never rounds up", () => {
  assert.equal(formatTime(12349), "12.34");
  assert.equal(formatTime(12349, 3), "12.349");
  assert.equal(formatTime(62500), "1:02.50");
  assert.equal(formatTime(3723400), "1:02:03.40");
  assert.equal(formatTime(9), "0.00");
  assert.equal(formatTime(59999), "59.99");
});

test("formatSolve: +2 shows the final time with a plus; DNF keeps raw on request", () => {
  assert.equal(formatSolve({ ms: 12340, penalty: 2000 }), "14.34+");
  assert.equal(formatSolve({ ms: 12340, penalty: -1 }), "DNF");
  assert.equal(formatSolve({ ms: 12340, penalty: -1 }, 2, true), "DNF(12.34)");
  assert.equal(formatStat(undefined), "–");
  assert.equal(formatStat(Infinity), "DNF");
});

test("solveValue truncates and applies +2; DNF is Infinity", () => {
  assert.equal(solveValue(solve(12349)), 12340);
  assert.equal(solveValue(solve(12349), 3), 12349);
  assert.equal(solveValue(solve(12349, 2000)), 14340);
  assert.equal(solveValue(solve(12349, -1)), Infinity);
  // 10 minutes and over: truncated to the whole second (WCA 9f2)
  assert.equal(solveValue(solve(628_888)), 628_000);
  assert.equal(solveValue(solve(628_888), 3), 628_888);
});

test("trim counts match csTimer at 5%", () => {
  assert.equal(trimCount(5, "ao"), 1);
  assert.equal(trimCount(12, "ao"), 1);
  assert.equal(trimCount(25, "ao"), 2);
  assert.equal(trimCount(50, "ao"), 3);
  assert.equal(trimCount(100, "ao"), 5);
  assert.equal(trimCount(1000, "ao"), 50);
  assert.equal(trimCount(3, "mo"), 0);
  assert.equal(trimCount(3, "ao", 50), 1); // never trims the whole window
});

test("ao5 drops exactly one best and one worst, even with ties", () => {
  assert.equal(averageOf([10000, 10000, 12000, 14000, 14000], "ao"), 12000);
  // (11.11 + 12.22 + 13.33) / 3 = 12.22
  assert.equal(averageOf([9000, 11110, 12220, 13330, 20000], "ao"), 12220);
});

test("ao5: one DNF is the dropped worst; two DNFs make it DNF", () => {
  assert.equal(averageOf([10000, 11000, 12000, 13000, D], "ao"), 12000);
  assert.equal(averageOf([10000, 11000, 12000, D, D], "ao"), D);
});

test("ao12 tolerates one DNF, not two", () => {
  const twelve = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((s) => s * 1000);
  assert.equal(averageOf(twelve, "ao"), 15500);
  assert.equal(averageOf([...twelve.slice(0, 11), D], "ao"), 15500); // DNF replaces the dropped worst
  assert.equal(averageOf([...twelve.slice(0, 10), D, D], "ao"), D);
});

test("ao100 tolerates five DNFs, not six", () => {
  const base = Array.from({ length: 95 }, (_, i) => 10000 + i * 10);
  assert.notEqual(averageOf([...base, D, D, D, D, D], "ao"), D);
  assert.equal(averageOf([...base.slice(0, 94), D, D, D, D, D, D], "ao"), D);
});

test("mo3: no trimming, any DNF is DNF", () => {
  assert.equal(averageOf([10000, 11000, 12000], "mo"), 11000);
  assert.equal(averageOf([10000, 11000, D], "mo"), D);
});

test("averages round to the hundredth; 10 minutes and over to the second", () => {
  assert.equal(roundAverage(12345.0), 12350);
  assert.equal(roundAverage(12344.9), 12340);
  assert.equal(roundAverage(12344.9, 3), 12345);
  assert.equal(roundAverage(600_499), 600_000);
  assert.equal(roundAverage(600_500), 601_000);
  // (10.00 + 10.01 + 10.01) / 3 = 10.00666… → 10.01
  assert.equal(averageOf([9000, 10000, 10010, 10010, 11000], "ao"), 10010);
});

test("rollingSeries equals a naive recompute at every index", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const values = Array.from({ length: 300 }, () =>
    rnd() < 0.06 ? D : Math.floor(8000 + rnd() * 8000),
  );
  for (const ind of [
    { kind: "mo" as const, n: 3 },
    { kind: "ao" as const, n: 5 },
    { kind: "ao" as const, n: 12 },
    { kind: "ao" as const, n: 50 },
  ]) {
    const fast = rollingSeries(values, ind);
    values.forEach((_, i) => {
      const expect = i >= ind.n - 1 ? averageOf(values.slice(i - ind.n + 1, i + 1), ind.kind) : undefined;
      assert.equal(fast[i], expect, `${ind.kind}${ind.n} at ${i}`);
    });
  }
});

test("sessionStats: mean excludes DNFs; best/worst are non-DNF; current/best windows", () => {
  const solves = [
    solve(12000),
    solve(10000),
    solve(11000, -1),
    solve(9000, 2000), // 11.00+
    solve(13000),
    solve(8000),
  ];
  const st = sessionStats(solves);
  assert.equal(st.count, 6);
  assert.equal(st.nonDnf, 5);
  assert.equal(st.best, 8000);
  assert.equal(st.bestIndex, 5);
  assert.equal(st.worst, 13000);
  assert.equal(st.mean, roundAverage((12000 + 10000 + 11000 + 13000 + 8000) / 5));
  const mo3 = st.indicators.find((i) => i.key === "mo3")!;
  const ao5 = st.indicators.find((i) => i.key === "ao5")!;
  assert.equal(mo3.current, roundAverage((11000 + 13000 + 8000) / 3));
  // windows: [12,10,DNF,11,13] → 12.00 ; [10,DNF,11,13,8] → 11.33
  assert.equal(ao5.series[4], 12000);
  assert.equal(ao5.current, roundAverage((10000 + 11000 + 13000) / 3));
  assert.equal(ao5.best, ao5.current);
  assert.equal(ao5.bestEnd, 5);
  const ao100 = st.indicators.find((i) => i.key === "ao100")!;
  assert.equal(ao100.current, undefined);
});

test("parseIndicator", () => {
  assert.deepEqual(parseIndicator("ao12"), { kind: "ao", n: 12 });
  assert.deepEqual(parseIndicator(" MO3 "), { kind: "mo", n: 3 });
  assert.equal(parseIndicator("ao2"), null);
  assert.equal(parseIndicator("avg5"), null);
});

console.log(`\n${n} tests passed`);
