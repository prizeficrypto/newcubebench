/**
 * Timing state machine tests. Run: node src/lib/timer/engine.test.ts
 * (Node strips the types natively; no test runner needed.)
 */
import assert from "node:assert/strict";
import {
  dueCalls,
  elapsedAt,
  initialEngineState,
  inspectionPenalty,
  isTiming,
  step,
  type EngineAction,
  type EngineConfig,
  type EngineState,
} from "./engine.ts";
import { inspectionText, phaseDurations, runningText, zeroText } from "./display.ts";

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok - ${name}`);
}

const BASE: EngineConfig = {
  holdMs: 300,
  inspection: false,
  phases: 1,
  stopKey: "any",
  external: false,
};

/** Run a list of actions from a fresh (or given) state. */
function run(actions: EngineAction[], c: EngineConfig = BASE, from?: EngineState): EngineState {
  return actions.reduce((s, a) => step(s, a, c), from ?? initialEngineState());
}

const down = (t: number, key: "trigger" | "other" = "trigger", repeat = false): EngineAction => ({
  type: "down",
  t,
  key,
  repeat,
});
const up = (t: number, key: "trigger" | "other" = "trigger"): EngineAction => ({ type: "up", t, key });
const tick = (t: number): EngineAction => ({ type: "tick", t });

test("hold turns red, then green after the hold time; release starts", () => {
  let s = run([down(1000)]);
  assert.equal(s.hold, "holding");
  assert.equal(isTiming(s), true);
  s = step(s, tick(1200), BASE);
  assert.equal(s.hold, "holding", "still red before 300 ms");
  s = step(s, tick(1300), BASE);
  assert.equal(s.hold, "ready", "green at 300 ms");
  s = step(s, up(1400), BASE);
  assert.equal(s.phase, "running");
  assert.equal(s.startAt, 1400);
  assert.equal(elapsedAt(s, 2400), 1000);
});

test("release before the hold time cancels; nothing starts", () => {
  const s = run([down(1000), tick(1100), up(1200)]);
  assert.equal(s.phase, "idle");
  assert.equal(s.hold, "none");
  assert.equal(isTiming(s), false);
});

test("release counts as ready even if no tick arrived in time", () => {
  const s = run([down(1000), up(1350)]);
  assert.equal(s.phase, "running");
});

test("hold time 0 is ready immediately", () => {
  const c = { ...BASE, holdMs: 0 };
  let s = run([down(10)], c);
  assert.equal(s.hold, "ready");
  s = step(s, up(20), c);
  assert.equal(s.phase, "running");
});

test("any key stops; the result is the raw time", () => {
  const s = run([down(0), up(400), down(12_740, "other")]);
  assert.equal(s.phase, "stopped");
  assert.deepEqual(s.result, { ms: 12_340, penalty: 0, splits: [] });
});

test("stop key 'space only' ignores other keys", () => {
  const c = { ...BASE, stopKey: "space" as const };
  let s = run([down(0), up(400), down(5000, "other")], c);
  assert.equal(s.phase, "running");
  s = step(s, down(6000), c);
  assert.equal(s.phase, "stopped");
  assert.equal(s.result?.ms, 5600);
});

test("key auto-repeat is ignored everywhere", () => {
  let s = run([down(0), down(50, "trigger", true), down(100, "trigger", true)]);
  assert.equal(s.hold, "holding");
  s = run([up(400), down(1000, "other", true)], BASE, s);
  assert.equal(s.phase, "running", "a repeat keydown does not stop");
  // and a second keydown without the repeat flag while held does not re-arm
  const held = run([down(0), tick(300)]);
  assert.equal(step(held, down(310), BASE), held);
});

test("the stopping press's release never starts anything", () => {
  let s = run([down(0), up(400), down(5000)]);
  assert.equal(s.phase, "stopped");
  s = step(s, up(5100), BASE);
  assert.equal(s.phase, "stopped");
  assert.equal(s.hold, "none");
});

test("a press within 500 ms of a stop does not re-arm", () => {
  let s = run([down(0), up(400), down(5000), up(5050)]);
  s = step(s, down(5300), BASE);
  assert.equal(s.hold, "none", "too soon after the stop");
  s = step(s, up(5700), BASE);
  assert.equal(s.phase, "stopped", "and its release starts nothing");
  s = run([down(5600), tick(5900), up(6000)], BASE, s);
  assert.equal(s.phase, "running", "a fresh press after the lockout works");
});

test("Esc while running stops with a DNF and keeps the raw time", () => {
  const s = run([down(0), up(400), { type: "escape", t: 9400 }]);
  assert.equal(s.phase, "stopped");
  assert.deepEqual(s.result, { ms: 9000, penalty: -1, splits: [] });
});

test("Esc during a hold or inspection cancels; nothing is recorded", () => {
  let s = run([down(0), tick(300), { type: "escape", t: 350 }]);
  assert.equal(s.hold, "none");
  assert.equal(s.result, null);
  const c = { ...BASE, inspection: true };
  s = run([down(0), up(100), { type: "escape", t: 3000 }], c);
  assert.equal(s.phase, "idle");
  assert.equal(s.result, null);
});

test("inspection: press+release starts it, hold-to-start ends it", () => {
  const c = { ...BASE, inspection: true };
  let s = run([down(0)], c);
  assert.equal(s.phase, "idle");
  assert.equal(s.hold, "none", "no hold colour on the inspection press");
  s = step(s, up(100), c);
  assert.equal(s.phase, "inspecting");
  assert.equal(s.inspectAt, 100);
  s = run([down(8000), tick(8300), up(8400)], c, s);
  assert.equal(s.phase, "running");
  assert.equal(s.penalty, 0);
});

test("inspection: an early release keeps inspecting", () => {
  const c = { ...BASE, inspection: true };
  const s = run([down(0), up(100), down(5000), up(5100)], c);
  assert.equal(s.phase, "inspecting");
  assert.equal(s.hold, "none");
});

test("inspection: starting after 15 s is +2, after 17 s DNF", () => {
  const c = { ...BASE, inspection: true };
  const startAt = (t: number) => run([down(0), up(0), down(t - 400), up(t), down(t + 10_000)], c);
  assert.equal(startAt(15_000).result?.penalty, 0, "exactly 15.00 s is fine");
  assert.equal(startAt(15_001).result?.penalty, 2000);
  assert.equal(startAt(17_000).result?.penalty, 2000);
  const dnf = startAt(17_001).result;
  assert.equal(dnf?.penalty, -1);
  assert.equal(dnf?.ms, 10_000, "the raw time is kept under a DNF");
  assert.equal(inspectionPenalty(16_000), 2000);
});

test("multi-phase: each stop press records a cumulative split", () => {
  const c = { ...BASE, phases: 3 };
  let s = run([down(0), up(400), down(3400)], c);
  assert.equal(s.phase, "running");
  assert.deepEqual(s.splits, [3000]);
  s = run([up(3450), down(9400)], c, s);
  assert.deepEqual(s.splits, [3000, 9000]);
  s = step(s, down(12_400, "other"), c);
  assert.equal(s.phase, "stopped");
  assert.deepEqual(s.result, { ms: 12_000, penalty: 0, splits: [3000, 9000, 12_000] });
  assert.deepEqual(phaseDurations(s.result!.splits), [3000, 6000, 3000]);
});

test("blur cancels a hold but never a running solve", () => {
  let s = run([down(0), tick(300), { type: "blur" }]);
  assert.equal(s.hold, "none");
  s = run([down(1000), up(1400), { type: "blur" }]);
  assert.equal(s.phase, "running");
});

test("external: the trigger never starts or stops the solve", () => {
  const c = { ...BASE, external: true };
  let s = run([down(0), tick(500), up(600)], c);
  assert.equal(s.phase, "idle");
  assert.equal(s.hold, "none");
  s = step(s, { type: "extHold", hold: "ready" }, c);
  assert.equal(s.hold, "ready");
  s = step(s, { type: "extStart", t: 1000 }, c);
  assert.equal(s.phase, "running");
  assert.equal(step(s, down(2000), c), s, "keys don't stop a hardware timer");
  s = step(s, { type: "extStop", t: 9000, ms: 7987 }, c);
  assert.deepEqual(s.result, { ms: 7987, penalty: 0, splits: [] });
});

test("external + inspection: penalty from the gap to the hardware start", () => {
  const c = { ...BASE, external: true, inspection: true };
  let s = run([down(0), up(50)], c);
  assert.equal(s.phase, "inspecting");
  s = run([{ type: "extHold", hold: "ready" }, { type: "extStart", t: 16_050 }], c, s);
  assert.equal(s.penalty, 2000);
  s = step(s, { type: "extStop", t: 26_000, ms: 9950 }, c);
  assert.equal(s.result?.penalty, 2000);
  assert.equal(s.result?.ms, 9950);
});

test("extStop is ignored unless the hardware was seen starting", () => {
  const c = { ...BASE, external: true };
  const s = initialEngineState();
  assert.equal(step(s, { type: "extStop", t: 100, ms: 5000 }, c), s);
});

test("reset returns to idle but keeps the stop lockout", () => {
  let s = run([down(0), up(400), down(5000)]);
  s = step(s, { type: "reset" }, BASE);
  assert.equal(s.phase, "idle");
  assert.equal(s.result, null);
  assert.equal(step(s, down(5100), BASE).hold, "none");
});

test("unchanged state is returned by identity (no needless renders)", () => {
  const s = initialEngineState();
  assert.equal(step(s, tick(100), BASE), s);
  assert.equal(step(s, up(100), BASE), s);
  assert.equal(step(s, { type: "blur" }, BASE), s);
  assert.equal(step(s, { type: "reset" }, BASE), s);
});

test("judge calls fire once each, 250 ms early", () => {
  assert.deepEqual(dueCalls(7700, []), []);
  assert.deepEqual(dueCalls(7750, []), [8000]);
  assert.deepEqual(dueCalls(9000, [8000]), []);
  assert.deepEqual(dueCalls(11_800, [8000]), [12000]);
  assert.deepEqual(dueCalls(13_000, []), [8000, 12000]);
});

test("display text: running granularity, inspection countdown", () => {
  assert.equal(runningText(12_345, "realtime", 2), "12.34");
  assert.equal(runningText(12_345, "realtime", 3), "12.345");
  assert.equal(runningText(12_345, "tenths", 2), "12.3");
  assert.equal(runningText(62_345, "tenths", 2), "1:02.3");
  assert.equal(runningText(62_345, "seconds", 2), "1:02");
  assert.equal(runningText(9_999, "seconds", 3), "9");
  assert.equal(runningText(9_999, "hidden", 2), "");
  assert.equal(inspectionText(0), "15");
  assert.equal(inspectionText(100), "15");
  assert.equal(inspectionText(1000), "14");
  assert.equal(inspectionText(14_500), "1");
  assert.equal(inspectionText(15_001), "+2");
  assert.equal(inspectionText(17_001), "DNF");
  assert.equal(zeroText(2), "0.00");
  assert.equal(zeroText(3), "0.000");
});

console.log(`\n${n} tests passed`);
