import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  dueCalls,
  elapsedAt,
  initialEngineState,
  isTiming,
  step,
  type EngineAction,
  type EngineConfig,
  type EngineResult,
  type EngineState,
} from "../../lib/timer/engine.ts";
import { inspectionText, runningText, type UpdateMode } from "../../lib/timer/display.ts";
import { keysBelongElsewhere } from "../../lib/timer/shortcuts.ts";
import type { Precision } from "../../lib/timer/format.ts";
import { primeSpeech } from "../../lib/timer/voice.ts";

/**
 * Wires the pure timer engine (lib/timer/engine.ts) to the page: keyboard,
 * touch, the animation frame that draws the running time, inspection calls,
 * and finished results.
 *
 * The running clock is written straight into a DOM node (`liveRef`) each frame
 * instead of through React state, so a 60 fps clock never re-renders the stats
 * and time list. React only re-renders when the engine changes phase.
 */
export function useTimerEngine(opts: {
  config: EngineConfig;
  update: UpdateMode;
  precision: Precision;
  /** false while typing mode is on or the page is busy — keys do nothing */
  keyboard: boolean;
  onResult: (r: EngineResult) => void;
  /** the judge call at 8000 or 12000 ms of inspection */
  onCall: (mark: number) => void;
}) {
  const [state, setState] = useState<EngineState>(initialEngineState);
  const stateRef = useRef(state);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const liveRef = useRef<HTMLDivElement>(null);
  const callsRef = useRef<number[]>([]);

  const dispatch = useCallback((a: EngineAction) => {
    const prev = stateRef.current;
    const next = step(prev, a, optsRef.current.config);
    if (next === prev) return;
    if (next.phase === "inspecting" && prev.phase !== "inspecting") callsRef.current = [];
    stateRef.current = next;
    setState(next);
    if (next.result && next.result !== prev.result) optsRef.current.onResult(next.result);
  }, []);

  // ---- animation: hold → ready, inspection countdown + calls, running clock ----
  const animating = state.phase === "running" || state.phase === "inspecting" || state.hold === "holding";
  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    const frame = () => {
      const t = performance.now();
      dispatch({ type: "tick", t });
      const s = stateRef.current;
      const el = liveRef.current;
      if (s.phase === "inspecting") {
        const elapsed = t - s.inspectAt;
        for (const mark of dueCalls(elapsed, callsRef.current)) {
          callsRef.current = [...callsRef.current, mark];
          optsRef.current.onCall(mark);
        }
        if (el) el.textContent = inspectionText(elapsed);
      } else if (s.phase === "running" && el) {
        const o = optsRef.current;
        el.textContent = runningText(elapsedAt(s, t), o.update, o.precision);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [animating, dispatch]);

  // ---- keyboard ----
  useEffect(() => {
    const isTrigger = (e: KeyboardEvent) => e.code === "Space";
    const onDown = (e: KeyboardEvent) => {
      if (!optsRef.current.keyboard) return;
      const running = stateRef.current.phase === "running";
      // While a solve runs every key belongs to the timer; otherwise fields,
      // selects and dialogs keep their keys.
      if (!running && keysBelongElsewhere(e.target, document)) return;
      primeSpeech();
      if (e.code === "Escape") {
        dispatch({ type: "escape", t: performance.now() });
        return;
      }
      // Modified keys are shortcuts (handled by the page), never timer input —
      // except that while running, any key stops.
      if (!running && (e.ctrlKey || e.altKey || e.metaKey)) return;
      if (isTrigger(e) || running) e.preventDefault();
      dispatch({
        type: "down",
        t: performance.now(),
        key: isTrigger(e) ? "trigger" : "other",
        repeat: e.repeat,
      });
    };
    const onUp = (e: KeyboardEvent) => {
      if (!optsRef.current.keyboard || !isTrigger(e)) return;
      if (stateRef.current.pressing) e.preventDefault();
      dispatch({ type: "up", t: performance.now(), key: "trigger" });
    };
    const onBlur = () => dispatch({ type: "blur" });
    const onVisibility = () => {
      if (document.hidden) dispatch({ type: "blur" });
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dispatch]);

  // ---- touch: the timer zone is the trigger; while running, any tap stops ----
  useEffect(() => {
    if (state.phase !== "running" || optsRef.current.config.external) return;
    const stop = (e: PointerEvent) => {
      e.preventDefault();
      dispatch({ type: "down", t: performance.now(), key: "other" });
    };
    window.addEventListener("pointerdown", stop, { capture: true });
    return () => window.removeEventListener("pointerdown", stop, { capture: true });
  }, [state.phase, dispatch]);

  const zoneHandlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (stateRef.current.phase === "running") return; // the window handler stops
      if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
      primeSpeech();
      dispatch({ type: "down", t: performance.now(), key: "trigger" });
    },
    onPointerUp: () => dispatch({ type: "up", t: performance.now(), key: "trigger" }),
    onPointerCancel: () => dispatch({ type: "blur" }),
  };

  // ---- focus mode: the page can hide everything but the clock ----
  const timing = isTiming(state);
  useEffect(() => {
    if (timing) document.body.dataset.timing = "1";
    else delete document.body.dataset.timing;
    return () => {
      delete document.body.dataset.timing;
    };
  }, [timing]);

  return { state, dispatch, liveRef, zoneHandlers, timing };
}
