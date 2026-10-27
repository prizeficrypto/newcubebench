import { useSyncExternalStore } from "react";
import { store } from "../store.ts";
import type { Precision } from "./format.ts";
import type { UpdateMode } from "./display.ts";
import { indicatorKey, parseIndicator, DEFAULT_INDICATORS } from "./stats.ts";

/**
 * Practice-timer preferences (the timer's own settings dialog, not the app's
 * Settings page). Persisted per device under one key; anything missing or
 * malformed falls back to its default, so old or hand-edited values never
 * break the timer. Defaults follow csTimer where the two overlap.
 */

export const SETTINGS_KEY = "cb_timer_settings_v1";

export type InputMethod = "timer" | "typing" | "stackmat" | "bluetooth";
/** inspection call-outs: spoken (male/female voice), a beep, or nothing */
export type AlertMode = "off" | "male" | "female" | "beep";

export type TimerSettings = {
  input: InputMethod;
  /** WCA 15 s inspection */
  inspection: boolean;
  alerts: AlertMode;
  /** a speechSynthesis voice name; "" picks one automatically */
  voiceName: string;
  /** 0-100 */
  volume: number;
  /** ms the trigger must be held before the timer is ready */
  holdMs: number;
  update: UpdateMode;
  precision: Precision;
  /** hide everything but the time while timing */
  zen: boolean;
  stopKey: "any" | "space";
  /** 1-4 phases (multi-split) per solve */
  phases: number;
  /** statistics shown, e.g. ["mo3","ao5","ao12","ao100"] */
  indicators: string[];
  /** trimmed from each side of an average, in percent */
  trimPct: number;
  /** open the scramble image tool by default */
  showScrambleImage: boolean;
  /** show the faster/slower difference against the previous solve */
  diffLabel: boolean;
};

export const HOLD_OPTIONS = [0, 300, 550, 1000] as const;
export const TRIM_OPTIONS = [0, 1, 5, 10, 20] as const;
export const PHASE_OPTIONS = [1, 2, 3, 4] as const;
export const INDICATOR_OPTIONS = [
  "mo3",
  "ao5",
  "ao12",
  "ao25",
  "ao50",
  "ao100",
  "ao200",
  "ao500",
  "ao1000",
] as const;

export const DEFAULT_SETTINGS: TimerSettings = {
  input: "timer",
  inspection: false,
  alerts: "female",
  voiceName: "",
  volume: 80,
  holdMs: 300,
  update: "realtime",
  precision: 2,
  zen: true,
  stopKey: "any",
  phases: 1,
  indicators: DEFAULT_INDICATORS.map(indicatorKey),
  trimPct: 5,
  showScrambleImage: true,
  diffLabel: true,
};

function oneOf<T>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

/** Coerce anything (stored JSON, a partial patch) into valid settings. */
export function sanitizeSettings(raw: unknown): TimerSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const indicators = Array.isArray(r.indicators)
    ? [
        ...new Set(
          r.indicators
            .filter((k): k is string => typeof k === "string")
            .map((k) => parseIndicator(k))
            .filter((i) => i !== null)
            .map((i) => indicatorKey(i!)),
        ),
      ]
    : d.indicators;
  const volume = typeof r.volume === "number" && Number.isFinite(r.volume) ? r.volume : d.volume;
  return {
    input: oneOf(r.input, ["timer", "typing", "stackmat", "bluetooth"] as const, d.input),
    inspection: typeof r.inspection === "boolean" ? r.inspection : d.inspection,
    alerts: oneOf(r.alerts, ["off", "male", "female", "beep"] as const, d.alerts),
    voiceName: typeof r.voiceName === "string" ? r.voiceName.slice(0, 200) : d.voiceName,
    volume: Math.round(Math.min(100, Math.max(0, volume))),
    holdMs: oneOf(r.holdMs, HOLD_OPTIONS, d.holdMs),
    update: oneOf(r.update, ["realtime", "tenths", "seconds", "hidden"] as const, d.update),
    precision: oneOf(r.precision, [2, 3] as const, d.precision),
    zen: typeof r.zen === "boolean" ? r.zen : d.zen,
    stopKey: oneOf(r.stopKey, ["any", "space"] as const, d.stopKey),
    phases: oneOf(r.phases, PHASE_OPTIONS, d.phases),
    indicators: indicators.length > 0 ? indicators : d.indicators,
    trimPct: oneOf(r.trimPct, TRIM_OPTIONS, d.trimPct),
    showScrambleImage:
      typeof r.showScrambleImage === "boolean" ? r.showScrambleImage : d.showScrambleImage,
    diffLabel: typeof r.diffLabel === "boolean" ? r.diffLabel : d.diffLabel,
  };
}

// ---- a tiny external store so every reader (timer, tools panel) agrees ----

let current: TimerSettings | null = null;
const listeners = new Set<() => void>();

export function getTimerSettings(): TimerSettings {
  current ??= sanitizeSettings(store.getJson(SETTINGS_KEY));
  return current;
}

export function setTimerSettings(patch: Partial<TimerSettings>): void {
  const next = sanitizeSettings({ ...getTimerSettings(), ...patch });
  current = next;
  store.setJson(SETTINGS_KEY, next);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React binding: the current settings and a patch-style setter. */
export function useTimerSettings(): [TimerSettings, (patch: Partial<TimerSettings>) => void] {
  const s = useSyncExternalStore(subscribe, getTimerSettings, getTimerSettings);
  return [s, setTimerSettings];
}

/** Settings → indicator objects, in a stable display order (mo first, then by n). */
export function settingsIndicators(s: TimerSettings) {
  return s.indicators
    .map((k) => parseIndicator(k))
    .filter((i) => i !== null)
    .map((i) => i!)
    .sort((a, b) => a.n - b.n || (a.kind === "mo" ? -1 : 1));
}
