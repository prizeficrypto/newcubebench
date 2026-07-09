import { useCallback, useEffect, useRef, useState } from "react";
import { formatAttempt, formatMs, type Attempt } from "../lib/cubing.ts";
import { isTouchDevice } from "../lib/pointer.ts";
import { useT } from "../lib/i18n.tsx";

/**
 * Solve timer. Two shapes, picked by the `inspection` prop:
 *
 *   practice (inspection off) — idle → press to start → press to stop.
 *   competition (inspection on) — idle → press to start 15s WCA inspection →
 *     press to start the solve → press to stop. The judge's "8 seconds" and
 *     "12 seconds" calls show as the count passes those marks; starting the
 *     solve after 15s adds a +2 penalty (kept simple: no 17s DNF tier).
 */
type Phase = "idle" | "inspecting" | "running" | "done";

const INSPECTION_MS = 15_000;

export function CompTimer({
  scramble,
  solveIndex,
  totalSolves,
  onComplete,
  practice = false,
  inspection = false,
}: {
  scramble: string;
  solveIndex: number;
  totalSolves: number;
  onComplete: (attempt: Attempt) => void;
  /** unlimited-practice mode (standalone Timer): no "of N", button reads
   *  "Solve again" instead of advancing a fixed round */
  practice?: boolean;
  /** 15s WCA inspection before the solve (competition Simulator) */
  inspection?: boolean;
}) {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [inspElapsed, setInspElapsed] = useState(0);
  const [result, setResult] = useState<Attempt | null>(null);
  const [touch] = useState(isTouchDevice);

  const solveStartRef = useRef<number | null>(null);
  const inspectionStartRef = useRef<number | null>(null);
  const penaltyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const inspTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** when the solve was stopped — guards the stop key/tap from immediately
   *  activating the autofocused "Next solve" button */
  const stoppedAtRef = useRef(0);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const stopRaf = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };
  const stopInspTimer = () => {
    if (inspTimerRef.current !== null) clearInterval(inspTimerRef.current);
    inspTimerRef.current = null;
  };

  const resetSolve = useCallback(() => {
    stopRaf();
    stopInspTimer();
    setPhase("idle");
    setElapsed(0);
    setInspElapsed(0);
    setResult(null);
    solveStartRef.current = null;
    inspectionStartRef.current = null;
    penaltyRef.current = false;
  }, []);

  // Full reset when the scramble/solve changes.
  useEffect(() => {
    resetSolve();
    return () => {
      stopRaf();
      stopInspTimer();
    };
  }, [solveIndex, scramble, resetSolve]);

  const tick = useCallback(() => {
    const start = solveStartRef.current;
    if (start != null) setElapsed(performance.now() - start);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startInspection = useCallback(() => {
    inspectionStartRef.current = performance.now();
    setInspElapsed(0);
    setPhase("inspecting");
    stopInspTimer();
    inspTimerRef.current = setInterval(() => {
      const start = inspectionStartRef.current;
      if (start != null) setInspElapsed(performance.now() - start);
    }, 100);
  }, []);

  const startSolve = useCallback(() => {
    stopInspTimer();
    // Penalty decided at the exact moment the solve starts.
    const now = performance.now();
    penaltyRef.current =
      inspection && inspectionStartRef.current != null
        ? now - inspectionStartRef.current > INSPECTION_MS
        : false;
    solveStartRef.current = now;
    setElapsed(0);
    setPhase("running");
    rafRef.current = requestAnimationFrame(tick);
  }, [inspection, tick]);

  const stopSolve = useCallback(() => {
    const start = solveStartRef.current;
    if (start == null) return;
    stopRaf();
    const now = performance.now();
    stoppedAtRef.current = now;
    const rawMs = now - start;
    setElapsed(rawMs);
    setResult({ rawMs, plus2: penaltyRef.current });
    setPhase("done");
  }, []);

  // Advance one step in the machine from a "press" (space or tap).
  const press = useCallback(() => {
    const p = phaseRef.current;
    if (p === "idle") inspection ? startInspection() : startSolve();
    else if (p === "inspecting") startSolve();
    else if (p === "running") stopSolve();
  }, [inspection, startInspection, startSolve, stopSolve]);

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
        if (e.repeat || performance.now() - stoppedAtRef.current < 400) {
          e.preventDefault();
        }
        return;
      }
      // idle / inspecting: space advances
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (e.repeat) return;
      press();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press, stopSolve]);

  // ---- touch / pointer on the timer zone ----
  // Advance fires on release; stop fires on press, so the stop tap's release
  // can't land on the Next button that appears afterward.
  const onZonePointerUp = useCallback(() => {
    const p = phaseRef.current;
    if (p === "idle" || p === "inspecting") press();
  }, [press]);

  const onZonePointerDown = useCallback(() => {
    if (phaseRef.current === "running") stopSolve();
  }, [stopSolve]);

  // ---- render ----
  const isLast = solveIndex === totalSolves - 1;
  const over = inspElapsed > INSPECTION_MS;
  const inspLeft = Math.max(0, Math.ceil((INSPECTION_MS - inspElapsed) / 1000));
  const call =
    inspElapsed >= 12_000 ? t("12 seconds") : inspElapsed >= 8_000 ? t("8 seconds") : "";

  return (
    <div className="solve">
      <div className="solve__head">
        <span className="eyebrow">
          {practice
            ? `${t("Solve")} ${solveIndex + 1}`
            : `${t("Solve")} ${solveIndex + 1} ${t("of")} ${totalSolves}`}
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
              {inspection
                ? touch
                  ? t("Tap to start inspection.")
                  : t("Press space to start inspection.")
                : touch
                  ? t("Tap the screen to start. Tap again to stop.")
                  : t("Press space to start. Press any key to stop.")}
            </div>
          </div>
        )}

        {phase === "inspecting" && (
          <div className="timer">
            <div className={`timer__time mono inspect${over ? " is-over" : ""}`}>
              {over ? "+2" : inspLeft}
            </div>
            <div className="timer__hint" role="status" aria-live="polite">
              {call && <span className="inspect__call">{call}</span>}
              {over
                ? t("Over 15 seconds. This solve is +2. Start when ready.")
                : touch
                  ? t("Inspecting. Tap to start your solve.")
                  : t("Inspecting. Press space to start your solve.")}
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="timer timer--running">
            <div className="timer__time mono">{formatMs(elapsed)}</div>
            <div className="timer__hint" role="status" aria-live="polite">
              {touch ? t("Tap to stop") : t("Any key to stop")}
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="timer timer--done">
            <div className="timer__time mono">{formatAttempt(result)}</div>
            <div className="timer__hint" role="status" aria-live="polite">
              {result.dnf
                ? t("Marked as DNF, so it won't count as a time")
                : penaltyRef.current
                  ? `${t("Inspection ran past 15 seconds. +2 included (stopwatch read")} ${formatMs(result.rawMs)})`
                  : result.plus2
                    ? `${t("+2 applied (stopwatch read")} ${formatMs(result.rawMs)})`
                    : t("Solve complete")}
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
              title={t("Discard this attempt and solve the same scramble again")}
            >
              {t("Redo")}
            </button>
            <button
              className={`post__chip post__chip--plus2${result.plus2 ? " is-on" : ""}`}
              aria-pressed={result.plus2}
              disabled={penaltyRef.current}
              title={
                penaltyRef.current
                  ? t("Automatic: inspection ran past 15 seconds")
                  : t("Mark a +2 penalty on this attempt")
              }
              onClick={() =>
                setResult((r) => (r ? { ...r, plus2: !r.plus2 } : r))
              }
            >
              {t("+2")}
            </button>
            <button
              className={`post__chip post__chip--dnf${result.dnf ? " is-on" : ""}`}
              aria-pressed={Boolean(result.dnf)}
              title={t("Mark this attempt as Did Not Finish")}
              onClick={() =>
                setResult((r) => (r ? { ...r, dnf: !r.dnf } : r))
              }
            >
              {t("DNF")}
            </button>
          </div>
          <button className="btn" onClick={() => onComplete(result)} autoFocus>
            {practice ? t("Solve again") : isLast ? t("See your ranking") : t("Next solve")}
          </button>
        </div>
      )}
    </div>
  );
}
