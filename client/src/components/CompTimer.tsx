import { useCallback, useEffect, useRef, useState } from "react";
import { formatAttempt, formatMs, type Attempt } from "../lib/cubing.ts";
import { isTouchDevice } from "../lib/pointer.ts";

/**
 * Plain solve timer — one start, one stop, no inspection or per-step taps:
 *
 *   idle     — scramble shown. Press space (or tap) to start immediately.
 *   running  — press any key (or tap) to stop.
 *   done     — result shown; +2 / DNF can be marked by hand.
 *
 * (Stage-split timing lives in the separate "Skill Timer" mode, toggled on the
 * solving screen.)
 */
type Phase = "idle" | "running" | "done";

export function CompTimer({
  scramble,
  solveIndex,
  totalSolves,
  onComplete,
  practice = false,
}: {
  scramble: string;
  solveIndex: number;
  totalSolves: number;
  onComplete: (attempt: Attempt) => void;
  /** unlimited-practice mode (standalone Timer): no "of N", button reads
   *  "Solve again" instead of advancing a fixed round */
  practice?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Attempt | null>(null);
  const [touch] = useState(isTouchDevice);

  const solveStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  /** when the solve was stopped — guards the stop key/tap from immediately
   *  activating the autofocused "Next solve" button */
  const stoppedAtRef = useRef(0);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const stopRaf = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const resetSolve = useCallback(() => {
    stopRaf();
    setPhase("idle");
    setElapsed(0);
    setResult(null);
    solveStartRef.current = null;
  }, []);

  // Full reset when the scramble/solve changes.
  useEffect(() => {
    resetSolve();
    return () => stopRaf();
  }, [solveIndex, scramble, resetSolve]);

  const tick = useCallback(() => {
    const start = solveStartRef.current;
    if (start != null) setElapsed(performance.now() - start);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startSolve = useCallback(() => {
    solveStartRef.current = performance.now();
    setElapsed(0);
    setPhase("running");
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const stopSolve = useCallback(() => {
    const start = solveStartRef.current;
    if (start == null) return;
    stopRaf();
    const now = performance.now();
    stoppedAtRef.current = now;
    const rawMs = now - start;
    setElapsed(rawMs);
    setResult({ rawMs, plus2: false });
    setPhase("done");
  }, []);

  // ---- keyboard ----

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const p = phaseRef.current;
      if (p === "running") {
        e.preventDefault();
        if (e.repeat) return;
        stopSolve();
        return;
      }
      if (p === "done") {
        // Swallow the stop key's auto-repeat / a press within a short grace
        // window so it can't click the autofocused Next button.
        if (e.repeat || performance.now() - stoppedAtRef.current < 400) {
          e.preventDefault();
        }
        return;
      }
      // idle: space starts
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (e.repeat) return;
      startSolve();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startSolve, stopSolve]);

  // ---- touch / pointer on the timer zone ----
  // Start fires on release (tap-to-start); stop fires on press, so the stop
  // tap's release can't land on the Next button that appears afterward.
  const onZonePointerUp = useCallback(() => {
    if (phaseRef.current === "idle") startSolve();
  }, [startSolve]);

  const onZonePointerDown = useCallback(() => {
    if (phaseRef.current === "running") stopSolve();
  }, [stopSolve]);

  // ---- render ----

  const isLast = solveIndex === totalSolves - 1;

  return (
    <div className="solve">
      <div className="solve__head">
        <span className="eyebrow">
          {practice ? `Solve ${solveIndex + 1}` : `Solve ${solveIndex + 1} of ${totalSolves}`}
        </span>
        <div className="solve__scramble mono">{scramble}</div>
      </div>

      <div
        className={`timer-zone timer-zone--${phase}`}
        onPointerDown={onZonePointerDown}
        onPointerUp={onZonePointerUp}
      >
        {phase === "idle" && (
          <div className="timer">
            <div className="timer__time mono">0.00</div>
            <div className="timer__hint" role="status" aria-live="polite">
              {touch
                ? "Tap the screen to start. Tap again to stop."
                : "Press space to start. Press any key to stop."}
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="timer timer--running">
            <div className="timer__time mono">{formatMs(elapsed)}</div>
            <div className="timer__hint" role="status" aria-live="polite">
              {touch ? "Tap to stop" : "Any key to stop"}
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="timer timer--done">
            {/* headline is the OFFICIAL time — a penalized solve reads "20.00+"
                here exactly as on the results screen */}
            <div className="timer__time mono">{formatAttempt(result)}</div>
            <div className="timer__hint" role="status" aria-live="polite">
              {result.dnf
                ? "Marked as DNF, so it won't count as a time"
                : result.plus2
                  ? `+2 applied (stopwatch read ${formatMs(result.rawMs)})`
                  : "Solve complete"}
            </div>
          </div>
        )}
      </div>

      {phase === "done" && result && (
        <div className="post">
          <div className="post__marks">
            <button
              className="post__chip"
              onClick={resetSolve}
              title="Discard this attempt and solve the same scramble again"
            >
              Redo
            </button>
            <button
              className={`post__chip post__chip--plus2${result.plus2 ? " is-on" : ""}`}
              aria-pressed={result.plus2}
              title="Mark a +2 penalty on this attempt"
              onClick={() =>
                setResult((r) => (r ? { ...r, plus2: !r.plus2 } : r))
              }
            >
              +2
            </button>
            <button
              className={`post__chip post__chip--dnf${result.dnf ? " is-on" : ""}`}
              aria-pressed={Boolean(result.dnf)}
              title="Mark this attempt as Did Not Finish"
              onClick={() =>
                setResult((r) => (r ? { ...r, dnf: !r.dnf } : r))
              }
            >
              DNF
            </button>
          </div>
          <button className="btn" onClick={() => onComplete(result)} autoFocus>
            {practice ? "Solve again" : isLast ? "See your ranking" : "Next solve"}
          </button>
        </div>
      )}
    </div>
  );
}
