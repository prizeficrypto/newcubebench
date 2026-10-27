/**
 * Typed-time parsing tests. Run: node src/lib/timer/typing.test.ts
 */
import assert from "node:assert/strict";
import {
  parseLocalDateTime,
  parseTimeText,
  parseTypedTimes,
  splitTypedEntries,
} from "./typing.ts";

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok - ${name}`);
}

/** Parse one entry that must succeed. */
function one(text: string) {
  const r = parseTypedTimes(text);
  assert.equal(r.errors.length, 0, `unexpected error for ${text}: ${r.errors.join("; ")}`);
  assert.equal(r.entries.length, 1, `expected one entry for ${text}`);
  return r.entries[0];
}

/** Parse one entry that must be rejected; returns the reason. */
function rejected(text: string) {
  const r = parseTypedTimes(text);
  assert.equal(r.entries.length, 0, `expected ${text} to be rejected`);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes(text.slice(0, 10)), "error quotes the entry");
  return r.rejected[0].reason;
}

test("plain decimal seconds", () => {
  assert.deepEqual(one("12.34"), { ms: 12340, penalty: 0 });
  assert.equal(one("9.8").ms, 9800);
  assert.equal(one("12.345").ms, 12345);
  assert.equal(one("12.3456").ms, 12345, "extra digits truncate");
  assert.equal(one(".5").ms, 500);
});

test("digits-only shorthand fills h:mm:ss.xx from the right", () => {
  assert.equal(one("1234").ms, 12340);
  assert.equal(one("12345").ms, 83450);
  assert.equal(one("1023456").ms, 3754560);
  assert.equal(one("987").ms, 9870);
  assert.equal(one("5").ms, 50);
});

test("colon forms", () => {
  assert.equal(one("1:02.5").ms, 62500);
  assert.equal(one("1:02").ms, 62000);
  assert.equal(one("1:02:03.40").ms, 3723400);
  assert.equal(parseTimeText("abc"), null);
  assert.equal(parseTimeText(""), null);
  assert.equal(parseTimeText("."), null);
  assert.equal(parseTimeText("1:"), null);
});

test("DNF keeps the stopwatch time; bare DNF is rejected", () => {
  assert.deepEqual(one("DNF(12.34)"), { ms: 12340, penalty: -1 });
  assert.deepEqual(one("DNF12.3"), { ms: 12300, penalty: -1 });
  assert.deepEqual(one("dnf(1:02.00)"), { ms: 62000, penalty: -1 });
  assert.deepEqual(one("(DNF(9.00))"), { ms: 9000, penalty: -1 });
  assert.equal(rejected("DNF"), "no-time");
  assert.equal(rejected("DNF()"), "no-time");
});

test("+2: the typed value includes the penalty", () => {
  assert.deepEqual(one("14.00+"), { ms: 12000, penalty: 2000 });
  assert.deepEqual(one("1400+"), { ms: 12000, penalty: 2000 });
  assert.equal(rejected("1.50+"), "not-positive");
});

test("parentheses from a copied time list", () => {
  assert.deepEqual(one("(9.87)"), { ms: 9870, penalty: 0 });
  assert.deepEqual(one("((9.87))"), { ms: 9870, penalty: 0 });
});

test("phase splits: kept when they add up, dropped otherwise", () => {
  assert.deepEqual(one("20.00=5.1+7.2+7.7").splits, [5100, 12300, 20000]);
  // rounding slack: 3 phases may be off by up to 30 ms in total
  assert.deepEqual(one("20.00=5.11+7.21+7.71").splits, [5110, 12320, 20000]);
  assert.equal(one("20.00=5+5+5").splits, undefined);
  assert.equal(one("20.00=20.00").splits, undefined, "one phase is no split");
  assert.equal(one("20.00=5.1+x").splits, undefined);
  assert.equal(one("20.00=5.1+7.2+7.7").ms, 20000);
  // +2 with splits: phases describe the stopwatch time
  const p = one("22.00+=5.1+7.2+7.7");
  assert.equal(p.ms, 20000);
  assert.equal(p.penalty, 2000);
  assert.deepEqual(p.splits, [5100, 12300, 20000]);
});

test("index, comment, scramble and date", () => {
  const e = one("3. 11.22[nice]   R U R'   @2024-05-01 10:00:00");
  assert.equal(e.ms, 11220);
  assert.equal(e.penalty, 0);
  assert.equal(e.comment, "nice");
  assert.equal(e.scramble, "R U R'");
  assert.equal(e.at, new Date(2024, 4, 1, 10, 0, 0).getTime());

  const d = one("12.34   @2024-05-01 10:00:00");
  assert.equal(d.scramble, undefined);
  assert.equal(d.at, new Date(2024, 4, 1, 10).getTime());

  const s = one("12.34   R U R' U'");
  assert.equal(s.scramble, "R U R' U'");
  assert.equal(s.at, undefined);

  assert.equal(one("12.34[]").comment, undefined, "empty comment dropped");
  assert.equal(one("12.34[a, b]").comment, "a, b", "comma inside a comment stays");
  assert.equal(rejected("12.34   R U   @not a date"), "unreadable");
});

test("separators: commas and newlines, but not inside brackets", () => {
  const r = parseTypedTimes("12.34, 13.45\n14.56\r\n\n  15.00  ,");
  assert.deepEqual(
    r.entries.map((e) => e.ms),
    [12340, 13450, 14560, 15000],
  );
  const sq1 = parseTypedTimes("12.34   (1,0)/ (-3,0)/ (0,3)/\n13.00");
  assert.equal(sq1.entries.length, 2);
  assert.equal(sq1.entries[0].scramble, "(1,0)/ (-3,0)/ (0,3)/");
  assert.deepEqual(splitTypedEntries("a(1,2),b[c,d],e"), ["a(1,2)", "b[c,d]", "e"]);
  // an unclosed bracket doesn't swallow the next line
  assert.deepEqual(splitTypedEntries("1(2,3\n4,5"), ["1(2,3", "4", "5"]);
});

test("times of zero or less are skipped with an error", () => {
  assert.equal(rejected("0"), "not-positive");
  assert.equal(rejected("0.00"), "not-positive");
  const r = parseTypedTimes("12.34, 0, 13.00");
  assert.equal(r.entries.length, 2);
  assert.equal(r.errors.length, 1);
});

test("garbage is rejected with a readable message per entry", () => {
  const r = parseTypedTimes("hello, 12.34, 12.34 seconds, 1:2:3:4");
  assert.equal(r.entries.length, 1);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /^"hello": not a time$/);
  assert.equal(rejected("12.34[unclosed"), "unreadable");
  assert.equal(rejected("DNF(12.34)+"), "unreadable");
});

test("long rejected input is shortened in the message", () => {
  const long = "x".repeat(100);
  const r = parseTypedTimes(long);
  assert.ok(r.errors[0].length < 70);
});

test("local date parsing", () => {
  assert.equal(parseLocalDateTime("2024-05-01"), new Date(2024, 4, 1).getTime());
  assert.equal(parseLocalDateTime("2024-05-01 9:05"), new Date(2024, 4, 1, 9, 5).getTime());
  assert.equal(parseLocalDateTime("2024-13-01 10:00:00"), null);
  assert.equal(parseLocalDateTime("2024-05-01 25:00:00"), null);
  assert.equal(parseLocalDateTime("yesterday"), null);
});

test("empty input", () => {
  assert.deepEqual(parseTypedTimes(""), { entries: [], errors: [], rejected: [] });
  assert.deepEqual(parseTypedTimes(" ,\n , "), { entries: [], errors: [], rejected: [] });
});

console.log(`\n${n} tests passed`);
