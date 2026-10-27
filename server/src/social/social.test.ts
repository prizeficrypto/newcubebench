/**
 * Pure social logic: WCA recompute, plausibility, handles, the sync wire
 * format, and the per-user limiter. Run: node server/src/social/social.test.ts
 */
import assert from "node:assert/strict";
import { attemptCs, averageCs, bestCs, parseAttempts, type SimAttempt } from "./scoring.ts";
import { plausibleAverage, plausibleSingle, isPbEvent } from "./plausibility.ts";
import { checkHandle, likePrefix } from "./handles.ts";
import { CHUNK_SIZE, hashChunk, inspectChunk, parseIdxList, parsePutBody } from "./syncCodec.ts";
import { allowHit } from "./rateLimit.ts";

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok - ${name}`);
}

const a = (rawMs: number, extra: Partial<SimAttempt> = {}): SimAttempt => ({
  rawMs,
  plus2: false,
  dnf: false,
  ...extra,
});

test("attempt time truncates to the centisecond and adds +2 as 200 cs", () => {
  assert.equal(attemptCs(a(12349)), 1234);
  assert.equal(attemptCs(a(12340, { plus2: true })), 1434);
  assert.equal(attemptCs(a(12340, { dnf: true })), null);
});

test("ao5 drops best and worst, rounds the mean of three", () => {
  // 10.00 11.00 12.01 13.00 20.00 → (1100 + 1201 + 1300) / 3 = 1200.33 → 1200
  assert.equal(averageCs([a(10000), a(11000), a(12010), a(13000), a(20000)], "ao5"), 1200);
  // (1000 + 1000 + 1002) / 3 = 1000.67 → rounds to 1001, not truncated
  assert.equal(averageCs([a(9000), a(10000), a(10009), a(10020), a(30000)], "ao5"), 1001);
});

test("ao5 with one DNF drops it as the worst; two DNFs make a DNF", () => {
  const one = [a(10000), a(11000), a(12000), a(13000), a(5000, { dnf: true })];
  assert.equal(averageCs(one, "ao5"), 1200); // drops 10.00 (best) and the DNF
  const two = [a(10000), a(11000), a(12000, { dnf: true }), a(13000), a(5000, { dnf: true })];
  assert.equal(averageCs(two, "ao5"), null);
});

test("+2 is applied before choosing best and worst", () => {
  // 9.00+ → 11.00, so the best becomes 10.00
  const at = [a(9000, { plus2: true }), a(10000), a(12000), a(13000), a(14000)];
  assert.equal(averageCs(at, "ao5"), Math.round((1100 + 1200 + 1300) / 3));
  assert.equal(bestCs(at), 1000);
});

test("mo3 means all three; any DNF is a DNF", () => {
  assert.equal(averageCs([a(60000), a(61000), a(62005)], "mo3"), 6100);
  assert.equal(averageCs([a(60000), a(61000), a(62000, { dnf: true })], "mo3"), null);
  assert.equal(bestCs([a(1, { dnf: true }), a(2, { dnf: true })]), null);
});

test("parseAttempts enforces the event's attempt count and bounds", () => {
  assert.equal(parseAttempts("333", [{ rawMs: 1 }]).ok, false);
  assert.equal(parseAttempts("666", [{ rawMs: 60000 }, { rawMs: 60000 }, { rawMs: 60000 }]).ok, true);
  assert.equal(parseAttempts("nope", []).ok, false);
  const bad = parseAttempts("333", [1, 2, 3, 4, 5].map(() => ({ rawMs: -5 })));
  assert.equal(bad.ok, false);
  const ok = parseAttempts("333", [1, 2, 3, 4, 5].map((i) => ({ rawMs: 10000 + i, plus2: i === 2, dnf: "yes" })));
  assert.ok(ok.ok && ok.attempts[1].plus2 && !ok.attempts[0].dnf);
});

test("plausibility floors sit below world records", () => {
  assert.equal(plausibleSingle("333", 2400), false);
  assert.equal(plausibleSingle("333", 3050), true);
  assert.equal(plausibleSingle("222", 390), false);
  assert.equal(plausibleSingle("222", 430), true);
  assert.equal(plausibleAverage("333", 3100), false);
  assert.equal(plausibleAverage("333", 3900), true);
  assert.equal(plausibleSingle("777", 4 * 60 * 60 * 1000), false);
  assert.equal(isPbEvent("333bf"), true);
  assert.equal(isPbEvent("magic"), false);
});

test("handles: shape, case, reserved words and the blocklist", () => {
  assert.deepEqual(checkHandle(" @Dan_K "), { ok: true, handle: "Dan_K", lower: "dan_k" });
  assert.deepEqual(checkHandle("ab"), { ok: false, reason: "invalid" });
  assert.deepEqual(checkHandle("a".repeat(21)), { ok: false, reason: "invalid" });
  assert.deepEqual(checkHandle("dan-k"), { ok: false, reason: "invalid" });
  assert.deepEqual(checkHandle("Settings"), { ok: false, reason: "reserved" });
  assert.deepEqual(checkHandle("wca_official"), { ok: false, reason: "reserved" });
  assert.deepEqual(checkHandle("the_cubebench_team"), { ok: false, reason: "reserved" });
  assert.deepEqual(checkHandle("sh1thead"), { ok: false, reason: "blocked" });
  assert.equal(checkHandle("sam_parker").ok, true);
  assert.equal(checkHandle(42).ok, false);
  assert.equal(likePrefix("a_b"), "a\\_b%");
});

// Shared with client/src/components/social/syncCore.test.ts: if these change,
// cloud sync breaks for every client. Keep both files identical here.
test("chunk hash is stable (pinned vectors shared with the client)", () => {
  assert.equal(hashChunk(""), "488bdcb81aee8d83");
  assert.equal(hashChunk("cube bench"), "aa5661351af71e59");
  assert.equal(hashChunk('[["~AAAAAAAAAAAAAAAAAAAAAA",12340,0,"R U",1700000000000]]'), "572e36cb4332c237");
  assert.equal(hashChunk("é漢字"), "4d090ca659335c57");
  assert.notEqual(hashChunk('[["a",1,0,"R",0]]'), hashChunk('[["a",2,0,"R",0]]'));
});

test("inspectChunk validates shape and counts solves", () => {
  const ok = JSON.stringify([["id1", 12340, 0, "R U", 1700000000000], ["id2", 9000, 2000, "", 5000, "nice", [1000, 9000], "t"]]);
  assert.deepEqual(inspectChunk(ok), { ok: true, count: 2 });
  assert.equal(inspectChunk("[]").ok, false);
  assert.equal(inspectChunk("{").ok, false);
  assert.equal(inspectChunk(JSON.stringify([["id", 1, 7, "", 0]])).ok, false); // bad penalty
  assert.equal(inspectChunk(JSON.stringify([["id", 1.5, 0, "", 0]])).ok, false); // fractional ms
  const big = JSON.stringify(Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => [`s${i}`, 1, 0, "", 0]));
  assert.equal(inspectChunk(big).ok, false);
});

test("parsePutBody verifies hashes, indexes and full non-final chunks", () => {
  const now = 1_800_000_000_000;
  const meta = { name: "3x3", event: "333", order: 0, createdAt: now - 1000, updatedAt: now };
  const full = JSON.stringify(Array.from({ length: CHUNK_SIZE }, (_, i) => [`s${i}`, 1000 + i, 0, "", 1]));
  const tail = JSON.stringify([["t1", 1000, 0, "", 1]]);
  const hashes = [hashChunk(full), hashChunk(tail)];
  const good = parsePutBody({ ...meta, hashes, chunks: [{ idx: 1, data: tail }] }, now);
  assert.ok(good.ok && good.body.chunks[0].count === 1 && good.body.chunks[0].hash === hashes[1]);
  // a partly-filled chunk that isn't last
  const notLast = parsePutBody({ ...meta, hashes: [hashChunk(tail), hashes[0]], chunks: [{ idx: 0, data: tail }] }, now);
  assert.equal(notLast.ok, false);
  // hash mismatch
  assert.equal(parsePutBody({ ...meta, hashes, chunks: [{ idx: 1, data: full }] }, now).ok, false);
  // index out of range
  assert.equal(parsePutBody({ ...meta, hashes, chunks: [{ idx: 2, data: tail }] }, now).ok, false);
  // a clock a week ahead
  assert.equal(parsePutBody({ ...meta, updatedAt: now + 7 * 86_400_000, hashes: [], chunks: [] }, now).ok, false);
  // tombstones carry no chunks
  assert.equal(parsePutBody({ ...meta, deleted: true, hashes, chunks: [] }, now).ok, false);
  assert.equal(parsePutBody({ ...meta, deleted: true, hashes: [], chunks: [] }, now).ok, true);
});

test("parseIdxList bounds and de-duplicates", () => {
  assert.equal(parseIdxList(undefined), null);
  assert.deepEqual(parseIdxList("3,1,3,x,-1,99999"), [1, 3]);
});

test("allowHit is a sliding window per key", () => {
  const t0 = 1_000_000;
  assert.equal(allowHit("u1", 2, 1000, t0), true);
  assert.equal(allowHit("u1", 2, 1000, t0 + 10), true);
  assert.equal(allowHit("u1", 2, 1000, t0 + 20), false);
  assert.equal(allowHit("u2", 2, 1000, t0 + 20), true);
  assert.equal(allowHit("u1", 2, 1000, t0 + 1011), true); // the first hit aged out
});

console.log(`\n${n} tests passed`);
