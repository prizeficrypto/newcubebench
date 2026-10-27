import type { Penalty } from "./model.ts";

/**
 * Typed-time parsing (the timer's "Typing" input and plain-text imports),
 * compatible with what csTimer users already type:
 *
 *   12.34                 → 12.34
 *   1234                  → 12.34   (digits only read right to left as
 *   12345                 → 1:23.45  h:mm:ss.xx, so no punctuation needed)
 *   1:02.5                → 1:02.50
 *   14.00+                → +2 (the typed value INCLUDES the penalty: raw 12.00)
 *   DNF(12.34) / DNF12.3  → DNF, stopwatch time kept
 *   (9.87)                → 9.87    (parentheses from a copied time list)
 *   20.00=5.1+7.2+7.7     → phase splits
 *   3. 11.22[nice]   R U R'   @2024-05-01 10:00:00
 *                         → index ignored, comment, scramble, date
 *
 * Entries are separated by newlines or by commas outside brackets (Square-1
 * scrambles contain commas inside their parentheses).
 */
export type TypedEntry = {
  /** raw stopwatch ms (penalty NOT included) */
  ms: number;
  penalty: Penalty;
  comment?: string;
  scramble?: string;
  /** epoch ms if a date was given */
  at?: number;
  splits?: number[];
};

/** Why an entry was rejected; stable codes so a UI can localize them. */
export type TypedRejectReason = "unreadable" | "no-time" | "not-positive";

export type TypedRejection = { input: string; reason: TypedRejectReason };

export type TypedParse = {
  entries: TypedEntry[];
  /** one readable (English) message per rejected entry */
  errors: string[];
  /** the same rejections, structured: render `t(TYPED_REJECT_TEXT[reason])` */
  rejected: TypedRejection[];
};

/** English text for each rejection reason (also the i18n key). */
export const TYPED_REJECT_TEXT: Record<TypedRejectReason, string> = {
  unreadable: "not a time",
  "no-time": "a DNF needs its time, like DNF(12.34)",
  "not-positive": "must be more than zero",
};

/** Longest slice of a rejected entry quoted back in an error message. */
const QUOTE_MAX = 40;

/** Phase splits may disagree with the total by this much per phase (typing rounding). */
const SPLIT_TOLERANCE_MS = 10;

/**
 * Split typed text into entries: newlines always separate, commas only at
 * bracket depth 0 (so "(1,0)/" in a Square-1 scramble and "[a, b]" in a
 * comment stay whole).
 */
export function splitTypedEntries(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (c === "\n" || (c === "," && depth === 0)) {
      out.push(input.slice(start, i));
      start = i + 1;
      if (c === "\n") depth = 0; // an unclosed bracket never swallows later lines
    }
  }
  out.push(input.slice(start));
  return out.map((s) => s.replace(/\r/g, "").trim()).filter((s) => s.length > 0);
}

/** Read up to three fraction digits as ms ("5" → 500, "34" → 340, "3456" → 345). */
function fractionMs(frac: string): number {
  return Number((frac + "000").slice(0, 3));
}

/**
 * A typed duration → ms, or null if it isn't one. Accepts "12.34", "1:02.5",
 * "1:02:03.40", "12" with a colon form, and digits-only shorthand where the
 * digits fill h:mm:ss.xx from the right ("1234" = 12.34, "12345" = 1:23.45).
 */
export function parseTimeText(text: string): number | null {
  const s = text.trim();
  if (/^\d+$/.test(s)) {
    const d = s.padStart(8, "0");
    const hours = Number(d.slice(0, d.length - 6));
    const minutes = Number(d.slice(-6, -4));
    const seconds = Number(d.slice(-4, -2));
    const hundredths = Number(d.slice(-2));
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + hundredths * 10;
  }
  // [h:]m:ss[.fff] or s.fff; the seconds part may be ".5" or "12."
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const [, a, b, secText, fracText] = m;
  if (!secText && !fracText) return null;
  if (a === undefined && b === undefined && fracText === undefined) return null; // digits handled above
  // With one colon the first group is minutes; with two, hours then minutes.
  const hours = b !== undefined ? Number(a) : 0;
  const minutes = b !== undefined ? Number(b) : a !== undefined ? Number(a) : 0;
  const seconds = secText ? Number(secText) : 0;
  const frac = fracText ? fractionMs(fracText) : 0;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + frac;
}

/** "YYYY-MM-DD[ hh:mm[:ss]]" in local time → epoch ms, or null. */
export function parseLocalDateTime(text: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    text.trim(),
  );
  if (!m) return null;
  const [y, mo, d, h, mi, sec] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  const at = new Date(y, mo - 1, d, h, mi, sec).getTime();
  return Number.isFinite(at) ? at : null;
}

/**
 * Phase durations ("5.1+7.2+7.7") → ascending cumulative split ends, last
 * exactly `ms`. Undefined unless there are 2+ phases that add up to `ms`
 * within the typing tolerance.
 */
function phaseSplits(text: string, ms: number): number[] | undefined {
  const phases = text.split("+").map(parseTimeText);
  if (phases.length < 2 || phases.some((p) => p === null || p <= 0)) return undefined;
  const durations = phases as number[];
  const sum = durations.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - ms) > SPLIT_TOLERANCE_MS * durations.length) return undefined;
  const splits: number[] = [];
  let acc = 0;
  for (const p of durations) {
    acc += p;
    splits.push(acc);
  }
  splits[splits.length - 1] = ms;
  return splits;
}

/** Peel "   scramble" and "   @date" off the end of an entry. */
function splitTail(text: string): { head: string; scramble: string; dateText: string } {
  const sep = /\s{3,}/.exec(text);
  if (!sep) return { head: text, scramble: "", dateText: "" };
  const head = text.slice(0, sep.index);
  let rest = text.slice(sep.index + sep[0].length);
  let dateText = "";
  const date = /(?:^|\s{3,})@([^@]*)$/.exec(rest);
  if (date) {
    dateText = date[1].trim();
    rest = rest.slice(0, date.index);
  }
  return { head, scramble: rest.trim(), dateText };
}

/** Parse one entry, or say why it can't be read. */
function parseEntry(text: string): TypedEntry | TypedRejectReason {
  const { head, scramble, dateText } = splitTail(text);
  let s = head.trim().replace(/^\d+\.\s+/, ""); // "3. " list index

  let comment: string | undefined;
  const open = s.indexOf("[");
  if (open >= 0) {
    if (!s.endsWith("]")) return "unreadable";
    comment = s.slice(open + 1, -1).trim() || undefined;
    s = s.slice(0, open).trim();
  }

  while (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1).trim();

  let penalty: Penalty = 0;
  if (/^dnf/i.test(s)) {
    penalty = -1;
    s = s.slice(3).trim();
    if (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1).trim();
    if (!s) return "no-time";
  }

  const eq = s.indexOf("=");
  const splitText = eq >= 0 ? s.slice(eq + 1) : "";
  let timeText = (eq >= 0 ? s.slice(0, eq) : s).trim();
  if (timeText.endsWith("+")) {
    if (penalty === -1) return "unreadable";
    penalty = 2000;
    timeText = timeText.slice(0, -1).trim();
  }

  const typed = parseTimeText(timeText);
  if (typed === null) return "unreadable";
  // A typed +2 is the final time; the stopwatch read 2 s less.
  const ms = penalty === 2000 ? typed - 2000 : typed;
  if (ms <= 0) return "not-positive";

  let at: number | undefined;
  if (dateText) {
    const parsed = parseLocalDateTime(dateText);
    if (parsed === null) return "unreadable";
    at = parsed;
  }

  const entry: TypedEntry = { ms, penalty };
  if (comment) entry.comment = comment;
  if (scramble) entry.scramble = scramble;
  if (at !== undefined) entry.at = at;
  const splits = splitText ? phaseSplits(splitText, ms) : undefined;
  if (splits) entry.splits = splits;
  return entry;
}

function quote(input: string): string {
  return input.length > QUOTE_MAX ? `${input.slice(0, QUOTE_MAX - 1)}…` : input;
}

export function parseTypedTimes(input: string): TypedParse {
  const entries: TypedEntry[] = [];
  const errors: string[] = [];
  const rejected: TypedRejection[] = [];
  for (const text of splitTypedEntries(input)) {
    const result = parseEntry(text);
    if (typeof result === "string") {
      rejected.push({ input: text, reason: result });
      errors.push(`"${quote(text)}": ${TYPED_REJECT_TEXT[result]}`);
    } else {
      entries.push(result);
    }
  }
  return { entries, errors, rejected };
}
