import type { Penalty } from "./model.ts";

/**
 * The timing state machine: a pure reducer with an injected clock. Every
 * action carries `t`, a monotonic reading in ms (performance.now() in the
 * app, plain numbers in tests), so the rules can be tested exactly without
 * timers or a DOM.
 *
 *   idle ──hold trigger (red)──> holding ──holdMs──> ready (green)
 *   ready ──release──> running ──stop key──> stopped
 *   holding ──early release──> back where it was (nothing starts)
 *
 * With WCA inspection on, a press+release in idle starts a 15 s inspection
 * first; the hold-to-start then happens during inspection. The penalty is
 * decided at the moment the solve starts: after 15 s it's +2, after 17 s DNF.
 *
 * "Trigger" is Space or a touch on the timer area. Other keys only ever stop
 * (unless the stop key is set to Space only). Esc stops a running solve as a
 * DNF (the raw time is kept), or cancels an inspection or a hold.
 *
 * External mode (Stackmat, Bluetooth timer, typed times): the hardware owns
 * start and stop. The trigger only starts inspection, and the hardware's
 * events arrive as extHold / extStart / extStop.
 */

export const INSPECTION_MS = 15_000;
export const INSPECTION_DNF_MS = 17_000;
/** a press this soon after a stop is the tail of the stop, never a new hold */
export const STOP_LOCKOUT_MS = 500;

export type EnginePhase = "idle" | "inspecting" | "running" | "stopped";
export type HoldState = "none" | "holding" | "ready";

export type EngineConfig = {
  /** how long the trigger must be held before the timer is ready (0 = instantly) */
  holdMs: number;
  /** WCA 15 s inspection before each solve */
  inspection: boolean;
  /** 1-4: each stop press records a split; the last one ends the solve */
  phases: number;
  /** "any": any key stops; "space": only the trigger does */
  stopKey: "any" | "space";
  /** start/stop come from hardware or typing, not the trigger */
  external: boolean;
};

export type EngineResult = {
  /** raw stopwatch ms (penalty not included) */
  ms: number;
  penalty: Penalty;
  /** cumulative split ends for multi-phase solves (last == ms), else [] */
  splits: number[];
};

export type EngineState = {
  phase: EnginePhase;
  hold: HoldState;
  /** when the current hold began */
  holdAt: number;
  /**
   * A trigger press that began in a startable state is down and will act on
   * release. The press that STOPS a solve never sets this, so its release
   * can't start an inspection or a new hold.
   */
  pressing: boolean;
  inspectAt: number;
  /** penalty decided when the running solve started (from inspection) */
  penalty: Penalty;
  startAt: number;
  /** cumulative split ends recorded so far in a running multi-phase solve */
  splits: number[];
  stoppedAt: number;
  /** the last finished solve; replaced (by identity) on every new result */
  result: EngineResult | null;
};

export type TriggerKey = "trigger" | "other";

export type EngineAction =
  | { type: "down"; t: number; key: TriggerKey; repeat?: boolean }
  | { type: "up"; t: number; key: TriggerKey }
  | { type: "tick"; t: number }
  | { type: "escape"; t: number }
  | { type: "blur" }
  | { type: "extHold"; hold: HoldState }
  | { type: "extStart"; t: number }
  | { type: "extStop"; t: number; ms: number }
  | { type: "reset" };

export function initialEngineState(): EngineState {
  return {
    phase: "idle",
    hold: "none",
    holdAt: 0,
    pressing: false,
    inspectAt: 0,
    penalty: 0,
    startAt: 0,
    splits: [],
    stoppedAt: Number.NEGATIVE_INFINITY,
    result: null,
  };
}

/** Penalty for starting a solve `elapsed` ms into inspection (WCA A3a1/A3a2). */
export function inspectionPenalty(elapsed: number): Penalty {
  if (elapsed > INSPECTION_DNF_MS) return -1;
  if (elapsed > INSPECTION_MS) return 2000;
  return 0;
}

/** True while a solve is being timed or about to be (zen mode hides the page). */
export function isTiming(s: EngineState): boolean {
  return s.phase === "inspecting" || s.phase === "running" || s.hold !== "none";
}

/** Stopwatch reading at `t`: live while running, the result once stopped. */
export function elapsedAt(s: EngineState, t: number): number {
  if (s.phase === "running") return Math.max(0, t - s.startAt);
  if (s.phase === "stopped" && s.result) return s.result.ms;
  return 0;
}

function beginHold(s: EngineState, t: number, c: EngineConfig): EngineState {
  return { ...s, pressing: true, hold: c.holdMs <= 0 ? "ready" : "holding", holdAt: t };
}

function isReady(s: EngineState, t: number, c: EngineConfig): boolean {
  return s.hold === "ready" || (s.hold === "holding" && t - s.holdAt >= c.holdMs);
}

function startRunning(s: EngineState, t: number): EngineState {
  return {
    ...s,
    phase: "running",
    hold: "none",
    pressing: false,
    penalty: s.phase === "inspecting" ? inspectionPenalty(t - s.inspectAt) : 0,
    startAt: t,
    splits: [],
    result: null,
  };
}

function finish(s: EngineState, t: number, result: EngineResult): EngineState {
  return {
    ...s,
    phase: "stopped",
    hold: "none",
    pressing: false,
    splits: [],
    stoppedAt: t,
    result,
  };
}

/** A stop press while running: record a split, and end on the last phase. */
function stopPress(s: EngineState, t: number, c: EngineConfig): EngineState {
  const at = Math.max(0, t - s.startAt);
  const splits = [...s.splits, at];
  const phases = Math.max(1, Math.min(4, Math.floor(c.phases) || 1));
  if (splits.length < phases) return { ...s, splits };
  return finish(s, t, { ms: at, penalty: s.penalty, splits: phases > 1 ? splits : [] });
}

export function step(s: EngineState, a: EngineAction, c: EngineConfig): EngineState {
  switch (a.type) {
    case "down": {
      if (a.repeat) return s; // OS key auto-repeat never acts
      if (s.phase === "running") {
        if (c.external) return s; // the hardware stops itself
        if (a.key === "other" && c.stopKey === "space") return s;
        return stopPress(s, a.t, c);
      }
      if (a.key !== "trigger") return s;
      if (s.pressing) return s; // already down (a repeat without the flag)
      if (a.t - s.stoppedAt < STOP_LOCKOUT_MS) return s;
      if (s.phase === "inspecting") return c.external ? s : beginHold(s, a.t, c);
      // idle or stopped
      if (c.inspection) return { ...s, pressing: true }; // inspection starts on release
      if (c.external) return s;
      return beginHold(s, a.t, c);
    }

    case "up": {
      if (a.key !== "trigger" || !s.pressing) return s;
      if (s.phase === "idle" || s.phase === "stopped") {
        if (c.inspection) {
          return {
            ...s,
            phase: "inspecting",
            pressing: false,
            // hardware hands-on state is the mat's to report, not ours to clear
            hold: c.external ? s.hold : "none",
            inspectAt: a.t,
            result: null,
          };
        }
        if (c.external) return { ...s, pressing: false };
        if (isReady(s, a.t, c)) return startRunning(s, a.t);
        return { ...s, pressing: false, hold: "none" }; // released too early
      }
      if (s.phase === "inspecting") {
        if (c.external) return { ...s, pressing: false };
        if (isReady(s, a.t, c)) return startRunning(s, a.t);
        return { ...s, pressing: false, hold: "none" }; // keep inspecting
      }
      return { ...s, pressing: false };
    }

    case "tick": {
      if (!c.external && s.hold === "holding" && a.t - s.holdAt >= c.holdMs) {
        return { ...s, hold: "ready" };
      }
      return s;
    }

    case "escape": {
      if (s.phase === "running") {
        // DNF, keeping the stopwatch reading; partial splits don't describe it
        return finish(s, a.t, { ms: Math.max(0, a.t - s.startAt), penalty: -1, splits: [] });
      }
      if (s.phase === "inspecting") {
        return { ...s, phase: "idle", hold: "none", pressing: false };
      }
      if (s.hold !== "none" || s.pressing) return { ...s, hold: "none", pressing: false };
      return s;
    }

    case "blur": {
      // Losing focus mid-hold (alt-tab, a system dialog) cancels the hold
      // rather than leaving it to fire on return. A running solve keeps going.
      if (s.phase === "running") return s;
      if (c.external) return s.pressing ? { ...s, pressing: false } : s;
      if (s.hold === "none" && !s.pressing) return s;
      return { ...s, hold: "none", pressing: false };
    }

    case "extHold": {
      if (s.phase === "running" || s.hold === a.hold) return s;
      return { ...s, hold: a.hold };
    }

    case "extStart": {
      if (s.phase === "running") return s;
      return startRunning(s, a.t);
    }

    case "extStop": {
      if (s.phase !== "running") return s;
      return finish(s, a.t, { ms: Math.max(0, Math.round(a.ms)), penalty: s.penalty, splits: [] });
    }

    case "reset": {
      if (s.phase === "idle" && s.hold === "none" && !s.pressing && !s.result) return s;
      return { ...initialEngineState(), stoppedAt: s.stoppedAt };
    }
  }
}

/** Inspection alert marks (the judge's calls), in ms of inspection. */
export const INSPECTION_CALLS = [8000, 12000] as const;
/** Calls fire this early so speech latency lands them on time. */
export const CALL_LEAD_MS = 250;

/**
 * Which judge calls are due at `elapsed` ms of inspection, given those
 * already made. Each call fires once per inspection.
 */
export function dueCalls(elapsed: number, made: readonly number[]): number[] {
  return INSPECTION_CALLS.filter((mark) => elapsed >= mark - CALL_LEAD_MS && !made.includes(mark));
}
