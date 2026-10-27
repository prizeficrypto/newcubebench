import { eventById } from "../events.ts";
import { formatSolve, formatStat, formatTime, type Precision } from "./format.ts";
import { newId, type Penalty, type TimerSession, type TimerSolve } from "./model.ts";
import { sessionStats } from "./stats.ts";
import { parseLocalDateTime, parseTimeText, parseTypedTimes } from "./typing.ts";

/**
 * Import/export of practice sessions. Reads csTimer's full JSON export,
 * csTimer CSV, Twisty Timer / Cubic Timer CSV and plain typed-time lists;
 * writes csTimer-compatible JSON, CSV and plain text.
 *
 * The formats are interoperability facts (field order, penalty codes, split
 * order); every parser here is our own. Imports always produce NEW sessions
 * with fresh ids: they are appended, never merged into or over existing data.
 */

/**
 * Something worth telling the user about an import. `message` is English
 * and doubles as the i18n key; `{name}` placeholders are filled from
 * `values` after translation.
 */
export type ImportIssue = { message: string; values?: Record<string, string | number> };

export type ImportResult = {
  /** detected format, e.g. "csTimer", "csTimer CSV", "Twisty Timer", "Text" */
  format: string;
  /** new sessions to append (fresh ids) */
  sessions: TimerSession[];
  /** the issues rendered in English */
  warnings: string[];
  /** the same issues, structured for translation */
  issues: ImportIssue[];
  /** the file doesn't say which puzzle (CSV, text): sessions defaulted to 3x3 */
  eventUnknown: boolean;
};

export type ImportOptions = {
  /** name for sessions whose file carries none (CSV, text) */
  defaultName?: string;
  /** clock for synthesized timestamps (tests) */
  now?: number;
};

export type ExportOptions = { precision?: Precision };

// ---------- event ids ----------

/** csTimer scramble type → our event id (both directions are WCA events). */
const CSTIMER_TO_EVENT: Record<string, string> = {
  "333": "333",
  "222so": "222",
  "444wca": "444",
  "555wca": "555",
  "666wca": "666",
  "777wca": "777",
  "333oh": "333oh",
  pyrso: "pyram",
  skbso: "skewb",
  mgmp: "minx",
  clkwca: "clock",
  sqrs: "sq1",
  "333ni": "333bf",
  "444bld": "444bf",
  "555bld": "555bf",
  "333fm": "333fm",
  r3ni: "333mbf",
};

const EVENT_TO_CSTIMER: Record<string, string> = Object.fromEntries(
  Object.entries(CSTIMER_TO_EVENT).map(([cs, ev]) => [ev, cs]),
);

/** Twisty Timer / Cubic Timer puzzle id → our event id. */
const TWISTY_TO_EVENT: Record<string, string> = {
  "222": "222",
  "333": "333",
  "444": "444",
  "555": "555",
  "666": "666",
  "777": "777",
  pyra: "pyram",
  mega: "minx",
  skewb: "skewb",
  clock: "clock",
  sq1: "sq1",
  "333bld": "333bf",
  "444bld": "444bf",
  "555bld": "555bf",
  "333oh": "333oh",
};

/** Events outside the competition simulator's list that imports can carry. */
const EXTRA_EVENT_LABELS: Record<string, string> = {
  "333bf": "3×3 Blindfolded",
  "444bf": "4×4 Blindfolded",
  "555bf": "5×5 Blindfolded",
  "333fm": "3×3 Fewest Moves",
  "333mbf": "3×3 Multi-Blind",
};

/** Short human label for an event id ("3×3", "Square-1", …). */
export function eventLabel(id: string): string {
  return eventById(id)?.display ?? EXTRA_EVENT_LABELS[id] ?? id;
}

// ---------- shared helpers ----------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** epoch ms → "YYYY-MM-DD hh:mm:ss" in local time (csTimer's CSV/typing form). */
export function formatLocalDateTime(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/** "cubebench_YYYYMMDD_hhmmss.<ext>" for a download made at `at`. */
export function exportFileName(ext: string, at: number = Date.now()): string {
  const d = new Date(at);
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `cubebench_${date}_${time}.${ext}`;
}

/** Fill `{name}` placeholders (after translating the template). */
export function fillIssue(template: string, values?: ImportIssue["values"]): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    values[k] === undefined ? m : String(values[k]),
  );
}

/** Stopwatch phases (durations) of a solve with splits, in order. */
function phaseDurations(s: TimerSolve): number[] {
  if (!s.splits || s.splits.length < 2) return [s.ms];
  return s.splits.map((end, i) => end - (i === 0 ? 0 : s.splits![i - 1]));
}

/** Splits are usable if strictly ascending, positive, and end at the total. */
function validSplits(splits: number[], ms: number): boolean {
  if (splits.length < 2 || splits[splits.length - 1] !== ms) return false;
  for (let i = 0; i < splits.length; i++) {
    if (!Number.isFinite(splits[i]) || splits[i] <= (i === 0 ? 0 : splits[i - 1])) return false;
  }
  return true;
}

function sessionOf(
  name: string,
  event: string,
  solves: TimerSolve[],
  order: number,
  now: number,
): TimerSession {
  const first = solves[0];
  return {
    id: newId(),
    name,
    event,
    solves,
    createdAt: first ? first.at - first.ms : now,
    updatedAt: now,
    order,
  };
}

const QUOTE = 34; // "
const LF = 10;
const CR = 13;

/**
 * Split delimiter-separated text into rows of fields. Fields may be
 * double-quoted (with "" for a literal quote) to carry the delimiter or a
 * newline. Slices rather than concatenating characters: 100k-row files are
 * a normal csTimer export.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const delim = delimiter.charCodeAt(0);
  const rows: string[][] = [];
  const n = text.length;
  let row: string[] = [];
  let i = 0;
  while (i < n) {
    let value: string;
    if (text.charCodeAt(i) === QUOTE) {
      let j = i + 1;
      let segStart = j;
      let built = "";
      while (j < n) {
        if (text.charCodeAt(j) === QUOTE) {
          if (text.charCodeAt(j + 1) !== QUOTE) break;
          built += text.slice(segStart, j + 1);
          j += 2;
          segStart = j;
        } else {
          j++;
        }
      }
      value = built + text.slice(segStart, j);
      i = j + 1;
      // anything between the closing quote and the delimiter is malformed: drop it
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === delim || c === LF || c === CR) break;
        i++;
      }
    } else {
      let j = i;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === delim || c === LF || c === CR) break;
        j++;
      }
      value = text.slice(i, j);
      i = j;
    }
    row.push(value);
    if (i >= n) break;
    if (text.charCodeAt(i) === delim) {
      i++;
      if (i >= n) row.push("");
      continue;
    }
    if (text.charCodeAt(i) === CR) i++;
    if (i < n && text.charCodeAt(i) === LF) i++;
    rows.push(row);
    row = [];
  }
  if (row.length) rows.push(row);
  return rows;
}

function isBlankRow(row: string[]): boolean {
  return row.length === 0 || (row.length === 1 && row[0].trim() === "");
}

/** Counts issues while parsing; turns them into the result's lists. */
class Issues {
  list: ImportIssue[] = [];
  add(message: string, values?: ImportIssue["values"]): void {
    this.list.push(values ? { message, values } : { message });
  }
  count(message: string, n: number): void {
    if (n > 0) this.add(message, { n });
  }
}

function result(
  format: string,
  sessions: TimerSession[],
  issues: Issues,
  eventUnknown = false,
): ImportResult {
  const total = sessions.reduce((a, s) => a + s.solves.length, 0);
  if (format !== "unknown" && total === 0) issues.add("No times found in this file.");
  return {
    format,
    sessions,
    warnings: issues.list.map((i) => fillIssue(i.message, i.values)),
    issues: issues.list,
    eventUnknown,
  };
}

// ---------- csTimer JSON ----------

type CsSessionMeta = {
  name?: unknown;
  opt?: { scrType?: unknown };
  rank?: unknown;
};

/** One csTimer solve → ours, or null if it's malformed. */
function fromCsTimerSolve(
  raw: unknown,
  fallbackAt: number,
  counters: { unusualPenalty: number },
): TimerSolve | null {
  if (!Array.isArray(raw) || !Array.isArray(raw[0])) return null;
  const times = raw[0] as unknown[];
  const pen = Number(times[0]);
  const total = Number(times[1]);
  if (!Number.isFinite(pen) || !Number.isFinite(total) || total < 0) return null;

  let ms = Math.round(total);
  let penalty: Penalty = 0;
  let foldedPenalty = false;
  if (pen < 0) penalty = -1;
  else if (pen === 2000) penalty = 2000;
  else if (pen > 0) {
    // Only +2 exists here; any other time penalty is kept by adding it.
    ms += Math.round(pen);
    foldedPenalty = true;
    counters.unusualPenalty++;
  }
  if (ms <= 0 && penalty !== -1) return null;

  const solve: TimerSolve = {
    id: newId(),
    ms,
    penalty,
    scramble: typeof raw[1] === "string" ? raw[1] : "",
    at: fallbackAt,
    src: "import",
  };
  if (typeof raw[2] === "string" && raw[2]) solve.comment = raw[2];
  const start = Number(raw[3]);
  if (Number.isFinite(start) && start > 0) solve.at = start * 1000 + ms;

  // csTimer keeps the earlier split ends newest-first after the total.
  if (times.length > 2 && !foldedPenalty) {
    const splits: number[] = [];
    for (let i = times.length - 1; i >= 2; i--) splits.push(Math.round(Number(times[i])));
    splits.push(ms);
    if (validSplits(splits, ms)) solve.splits = splits;
  }
  return solve;
}

function parseCsTimerJson(
  obj: Record<string, unknown>,
  now: number,
  issues: Issues,
): TimerSession[] {
  const props = (obj.properties ?? {}) as Record<string, unknown>;
  let meta: Record<string, CsSessionMeta> = {};
  const sd = props.sessionData;
  if (typeof sd === "string") {
    try {
      meta = JSON.parse(sd) ?? {};
    } catch {
      issues.add("Session names could not be read; numbered instead.");
    }
  } else if (sd && typeof sd === "object") {
    meta = sd as Record<string, CsSessionMeta>;
  }

  const indices = new Set<number>();
  for (const key of Object.keys(obj)) {
    const m = /^session(\d+)$/.exec(key);
    if (m) indices.add(Number(m[1]));
  }
  for (const key of Object.keys(meta)) if (/^\d+$/.test(key)) indices.add(Number(key));

  const rank = (i: number) => {
    const r = Number(meta[i]?.rank);
    return Number.isFinite(r) ? r : i;
  };
  const ordered = [...indices].sort((a, b) => rank(a) - rank(b) || a - b);

  const counters = { unusualPenalty: 0 };
  let malformed = 0;
  let empty = 0;
  const unknownTypes = new Set<string>();
  const sessions: TimerSession[] = [];

  for (const idx of ordered) {
    let rawSolves = obj[`session${idx}`];
    if (typeof rawSolves === "string") {
      try {
        rawSolves = JSON.parse(rawSolves);
      } catch {
        rawSolves = [];
      }
    }
    const list = Array.isArray(rawSolves) ? rawSolves : [];
    const solves: TimerSolve[] = [];
    let lastAt = now;
    for (const raw of list) {
      const s = fromCsTimerSolve(raw, lastAt, counters);
      if (!s) {
        malformed++;
        continue;
      }
      lastAt = s.at;
      solves.push(s);
    }
    if (solves.length === 0) {
      empty++;
      continue;
    }

    const m = meta[idx] ?? {};
    const scrType = typeof m.opt?.scrType === "string" ? m.opt.scrType : "333";
    let event = CSTIMER_TO_EVENT[scrType];
    if (!event) {
      unknownTypes.add(scrType);
      event = "333";
    }
    const rawName = m.name;
    const name =
      (typeof rawName === "string" || typeof rawName === "number") && String(rawName).trim()
        ? String(rawName).trim()
        : String(idx);
    sessions.push(sessionOf(name, event, solves, sessions.length, now));
  }

  issues.count("Skipped, could not be read: {n}", malformed);
  issues.count("Empty sessions skipped: {n}", empty);
  issues.count("Unusual penalties added to the time: {n}", counters.unusualPenalty);
  if (unknownTypes.size) {
    issues.add("Unknown scramble types imported as 3x3: {types}", {
      types: [...unknownTypes].join(", "),
    });
  }
  return sessions;
}

// ---------- csTimer CSV ----------

/** Read a display time ("12.34", "13.23+", "DNF(13.45)", "DNF"). */
function readDisplayTime(text: string): { ms: number | null; penalty: Penalty } {
  let s = text.trim();
  let penalty: Penalty = 0;
  if (/^dnf/i.test(s)) {
    penalty = -1;
    s = s.slice(3).replace(/^\(|\)$/g, "").trim();
  } else if (s.endsWith("+")) {
    penalty = 2000;
    s = s.slice(0, -1).trim();
  }
  const typed = s ? parseTimeText(s) : null;
  if (typed === null) return { ms: null, penalty };
  return { ms: penalty === 2000 ? typed - 2000 : typed, penalty };
}

function parseCsTimerCsv(text: string, opts: Required<ImportOptions>, issues: Issues) {
  const rows = parseDelimited(text, ";");
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const timeCol = col("Time");
  const commentCol = col("Comment");
  const scrambleCol = col("Scramble");
  const dateCol = col("Date");
  const phaseCols = header
    .map((h, i) => ({ k: /^P\.(\d+)$/.exec(h), i }))
    .filter((x) => x.k)
    .sort((a, b) => Number(a.k![1]) - Number(b.k![1]))
    .map((x) => x.i);

  const solves: TimerSolve[] = [];
  let malformed = 0;
  let lastAt = opts.now;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    const shown = readDisplayTime(row[timeCol] ?? "");

    // The phase columns hold the stopwatch time exactly; Time only says +2/DNF.
    const phases: number[] = [];
    let phasesOk = true;
    for (const c of phaseCols) {
      const v = (row[c] ?? "").trim();
      if (!v) continue;
      const p = parseTimeText(v);
      if (p === null) phasesOk = false;
      else phases.push(p);
    }
    const ms =
      phasesOk && phases.length ? phases.reduce((a, b) => a + b, 0) : shown.ms;
    if (ms === null || (ms <= 0 && shown.penalty !== -1)) {
      malformed++;
      continue;
    }

    const solve: TimerSolve = {
      id: newId(),
      ms,
      penalty: shown.penalty,
      scramble: (row[scrambleCol] ?? "").trim(),
      at: lastAt,
      src: "import",
    };
    const comment = (row[commentCol] ?? "").trim();
    if (comment) solve.comment = comment;
    const start = parseLocalDateTime(row[dateCol] ?? "");
    if (start !== null) solve.at = start + ms;
    if (phasesOk && phases.length >= 2) {
      let acc = 0;
      const splits = phases.map((p) => (acc += p));
      if (validSplits(splits, ms)) solve.splits = splits;
    }
    lastAt = solve.at;
    solves.push(solve);
  }
  issues.count("Skipped, could not be read: {n}", malformed);
  return solves.length ? [sessionOf(opts.defaultName, "333", solves, 0, opts.now)] : [];
}

// ---------- Twisty Timer / Cubic Timer ----------

/**
 * Rows: "Puzzle";"Category";"Time(millis)";"Date(millis)";"Scramble";"Penalty";"Comment".
 * Penalty 0 = none, 1 = +2, 2 = DNF. Twisty Timer stores a +2 solve's time
 * with the 2 seconds already added, so the stopwatch reading is time − 2000.
 * One session per Puzzle + Category.
 */
function parseTwistyCsv(body: string, opts: Required<ImportOptions>, issues: Issues) {
  const groups = new Map<string, { puzzle: string; category: string; solves: TimerSolve[] }>();
  let malformed = 0;
  const rows = parseDelimited(body, ";");
  for (const row of rows) {
    if (isBlankRow(row)) continue;
    const [puzzle = "", category = "", timeText, dateText, scramble = "", penText, comment = ""] =
      row.map((f) => f.trim());
    const time = Number(timeText);
    const date = Number(dateText);
    const pen = Number(penText);
    if (!Number.isFinite(time) || time <= 0 || ![0, 1, 2].includes(pen)) {
      malformed++;
      continue;
    }
    const penalty: Penalty = pen === 1 ? 2000 : pen === 2 ? -1 : 0;
    const ms = Math.round(penalty === 2000 ? time - 2000 : time);
    if (ms <= 0) {
      malformed++;
      continue;
    }
    const key = `${puzzle}\u0000${category}`;
    let g = groups.get(key);
    if (!g) {
      g = { puzzle, category, solves: [] };
      groups.set(key, g);
    }
    const solve: TimerSolve = {
      id: newId(),
      ms,
      penalty,
      scramble,
      at: Number.isFinite(date) && date > 0 ? date : opts.now,
      src: "import",
    };
    if (comment) solve.comment = comment;
    g.solves.push(solve);
  }
  issues.count("Skipped, could not be read: {n}", malformed);

  const sessions: TimerSession[] = [];
  const unknown = new Set<string>();
  for (const g of groups.values()) {
    let event = TWISTY_TO_EVENT[g.puzzle];
    if (!event) {
      unknown.add(g.puzzle);
      event = "333";
    }
    // the timer lists newest first; our sessions are chronological
    g.solves.sort((a, b) => a.at - b.at);
    const base = TWISTY_TO_EVENT[g.puzzle] ? eventLabel(event) : g.puzzle || eventLabel(event);
    const name = g.category && g.category.toLowerCase() !== "normal" ? `${base} ${g.category}` : base;
    sessions.push(sessionOf(name, event, g.solves, sessions.length, opts.now));
  }
  if (unknown.size) {
    issues.add("Unknown puzzles imported as 3x3: {types}", { types: [...unknown].join(", ") });
  }
  return sessions;
}

// ---------- plain text (typing format) ----------

function parseText(text: string, opts: Required<ImportOptions>, issues: Issues) {
  const { entries, rejected } = parseTypedTimes(text);
  const solves: TimerSolve[] = entries.map((e, i) => {
    const solve: TimerSolve = {
      id: newId(),
      ms: e.ms,
      penalty: e.penalty,
      scramble: e.scramble ?? "",
      // undated entries: one second apart, in order, ending now
      at: e.at ?? opts.now - (entries.length - i) * 1000,
      src: "import",
    };
    if (e.comment) solve.comment = e.comment;
    if (e.splits) solve.splits = e.splits;
    return solve;
  });
  issues.count("Skipped, could not be read: {n}", rejected.length);
  if (rejected.length) {
    const ex = rejected[0].input;
    issues.add("First unreadable entry: {example}", {
      example: ex.length > 40 ? `${ex.slice(0, 39)}…` : ex,
    });
  }
  return solves.length ? [sessionOf(opts.defaultName, "333", solves, 0, opts.now)] : [];
}

// ---------- detection ----------

const CSTIMER_CSV_HEADER = "no.;time;comment;scramble;date";
const TWISTY_HEADER = "puzzle,category,time(millis),date(millis),scramble,penalty,comment";
const CUBIC_HEADER = "puzzle;category;time(millis);date(millis);scramble;penalty;comment";

/**
 * Detect the format by how the file starts and parse it into new sessions.
 * Never throws: an unreadable file comes back with format "unknown" and an
 * issue explaining why.
 */
export function parseImport(
  text: string,
  filename?: string,
  options: ImportOptions = {},
): ImportResult {
  const fileBase = filename?.replace(/\.[^.]+$/, "").trim();
  const opts: Required<ImportOptions> = {
    defaultName: options.defaultName ?? (fileBase || "Imported"),
    now: options.now ?? Date.now(),
  };
  const issues = new Issues();
  const body = text.replace(/^﻿/, "").replace(/^\s+/, "");

  if (body.startsWith("{")) {
    let obj: unknown;
    try {
      obj = JSON.parse(body);
    } catch {
      issues.add("This file looks like JSON but could not be read.");
      return result("unknown", [], issues);
    }
    if (
      obj &&
      typeof obj === "object" &&
      Object.keys(obj).some((k) => /^session\d+$/.test(k) || k === "properties")
    ) {
      return result("csTimer", parseCsTimerJson(obj as Record<string, unknown>, opts.now, issues), issues);
    }
    issues.add("This JSON file is not a csTimer export.");
    return result("unknown", [], issues);
  }

  const nl = body.indexOf("\n");
  const firstLine = (nl < 0 ? body : body.slice(0, nl)).trim();
  const key = firstLine.replace(/"/g, "").toLowerCase();
  const rest = nl < 0 ? "" : body.slice(nl + 1);

  if (key.startsWith(CSTIMER_CSV_HEADER)) {
    return result("csTimer CSV", parseCsTimerCsv(body, opts, issues), issues, true);
  }
  if (key === TWISTY_HEADER) {
    return result("Twisty Timer", parseTwistyCsv(rest, opts, issues), issues);
  }
  if (key === CUBIC_HEADER) {
    return result("Cubic Timer", parseTwistyCsv(rest, opts, issues), issues);
  }
  return result("Text", parseText(body, opts, issues), issues, true);
}

// ---------- export ----------

/** Unix seconds when the solve started (our `at` is when it ended). */
function startSeconds(s: TimerSolve): number {
  return Math.round((s.at - s.ms) / 1000);
}

function toCsTimerSolve(s: TimerSolve): unknown[] {
  const times: number[] = [s.penalty, s.ms];
  if (s.splits && s.splits.length >= 2) {
    for (let i = s.splits.length - 2; i >= 0; i--) times.push(s.splits[i]);
  }
  return [times, s.scramble, s.comment ?? "", startSeconds(s)];
}

/** csTimer full-export JSON ("session1"… + properties.sessionData). */
export function exportCsTimerJson(sessions: TimerSession[]): string {
  const live = sessions.filter((s) => !s.deleted);
  // csTimer recognizes its own export by the leading "session1" key, so the
  // session keys go in before "properties" (object keys keep insertion order).
  const out: Record<string, unknown> = {};
  const meta: Record<string, unknown> = {};
  if (live.length === 0) {
    out.session1 = [];
    meta[1] = { name: 1, opt: {}, rank: 1, stat: [0, 0, -1], date: [null, null] };
  }
  live.forEach((s, i) => {
    const idx = i + 1;
    out[`session${idx}`] = s.solves.map(toCsTimerSolve);
    let dnf = 0;
    let sum = 0;
    let maxPhases = 1;
    for (const x of s.solves) {
      if (x.penalty === -1) dnf++;
      else sum += x.ms + (x.penalty === 2000 ? 2000 : 0);
      if (x.splits && x.splits.length > maxPhases) maxPhases = x.splits.length;
    }
    const counted = s.solves.length - dnf;
    const opt: Record<string, unknown> = {};
    const scrType = EVENT_TO_CSTIMER[s.event];
    if (scrType && scrType !== "333") opt.scrType = scrType;
    if (maxPhases > 1) opt.phases = maxPhases;
    const first = s.solves[0];
    const last = s.solves[s.solves.length - 1];
    meta[idx] = {
      name: s.name,
      opt,
      rank: idx,
      stat: [s.solves.length, dnf, counted ? sum / counted : -1],
      date: first ? [startSeconds(first), startSeconds(last)] : [null, null],
    };
  });
  out.properties = {
    session: 1,
    sessionN: Math.max(1, live.length),
    sessionData: JSON.stringify(meta),
  };
  return JSON.stringify(out);
}

function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** csTimer-style CSV for one session (semicolon-separated, CRLF). */
export function exportCsv(session: TimerSession, options: ExportOptions = {}): string {
  const precision = options.precision ?? 2;
  let phases = 1;
  for (const s of session.solves) {
    if (s.splits && s.splits.length > phases) phases = s.splits.length;
  }
  const header = ["No.", "Time", "Comment", "Scramble", "Date"];
  for (let k = 1; k <= phases; k++) header.push(`P.${k}`);
  const lines = [header.join(";")];
  session.solves.forEach((s, i) => {
    const durations = phaseDurations(s).map((d) => formatTime(d, precision));
    while (durations.length < phases) durations.push("");
    const fields = [
      String(i + 1),
      formatSolve(s, precision, true),
      s.comment ?? "",
      s.scramble,
      formatLocalDateTime(s.at - s.ms),
      ...durations,
    ];
    lines.push(fields.map(csvField).join(";"));
  });
  return lines.join("\r\n");
}

/**
 * One solve in the typing format ("1. 14.34+[comment]   scramble   @date"),
 * so a copied report can be pasted back into any typed-times box.
 */
function textLine(s: TimerSolve, i: number, precision: Precision): string {
  let time = formatSolve(s, precision, true);
  if (s.splits && s.splits.length >= 2) {
    const phases = phaseDurations(s).map((d) => formatTime(d, precision)).join("+");
    time = s.penalty === -1 ? `DNF(${formatTime(s.ms, precision)}=${phases})` : `${time}=${phases}`;
  }
  const comment = s.comment ? `[${s.comment.replace(/[[\]\n]/g, " ")}]` : "";
  const scramble = s.scramble ? `   ${s.scramble.replace(/\s*\n\s*/g, " ")}` : "";
  return `${i + 1}. ${time}${comment}${scramble}   @${formatLocalDateTime(s.at)}`;
}

/** Human-readable text report for one session. */
export function exportText(
  session: TimerSession,
  options: ExportOptions & { t?: (key: string) => string; now?: number } = {},
): string {
  const precision = options.precision ?? 2;
  const t = options.t ?? ((k: string) => k);
  const st = sessionStats(session.solves, {
    indicators: [
      { kind: "ao", n: 5 },
      { kind: "ao", n: 12 },
    ],
    precision,
  });
  const [ao5, ao12] = st.indicators;
  const f = (v: number | undefined) => formatStat(v, precision);
  const lines = [
    `${session.name} · ${eventLabel(session.event)}`,
    formatLocalDateTime(options.now ?? Date.now()),
    "",
    `${t("Solves")}: ${st.count}`,
    `${t("DNF")}: ${st.count - st.nonDnf}`,
    `${t("Best")}: ${f(st.best)}`,
    `${t("Mean")}: ${f(st.mean)}`,
    `${t("Current ao5")}: ${f(ao5.current)}`,
    `${t("Best ao5")}: ${f(ao5.best)}`,
    `${t("Current ao12")}: ${f(ao12.current)}`,
    `${t("Best ao12")}: ${f(ao12.best)}`,
  ];
  if (session.solves.length) {
    lines.push("", `${t("Time list")}:`);
    session.solves.forEach((s, i) => lines.push(textLine(s, i, precision)));
  }
  return lines.join("\n");
}
