import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CompTimer } from "../components/CompTimer.tsx";
import { SolveTimer } from "../components/SolveTimer.tsx";
import { useAuth } from "../lib/auth.tsx";
import { nextScramble, warmUp } from "../lib/scrambles.ts";
import { store } from "../lib/store.ts";
import {
  formatMs,
  stageBreakdown,
  STAGE_LABEL,
  STAGE_ORDER,
  type Attempt,
  type Solve,
} from "../lib/cubing.ts";

/**
 * The Timer: free-form 3x3 practice, unlimited solves.
 *
 *   Regular — one start, one stop. A plain solve timer (default).
 *   Skill Timer — tap the spacebar at the end of each stage (cross, F2L, OLL,
 *                 PLL); the session summary then shows where your time goes.
 *
 * The session (either kind of solve) survives navigation and refresh.
 */
const SESSION_KEY = "cb_timer_session_v2";
/** Personal best (min single, ms) persisted across sessions — 3x3 practice. */
const PB_KEY = "cb_timer_pb_v1";

type Mode = "regular" | "skill";
/** A practice solve. Stage splits are present only for Skill-Timer solves. */
type PracticeSolve = { totalMs: number; stages?: Solve["stages"] };

export default function SkillTimer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPro = Boolean(user?.pro);
  const [mode, setMode] = useState<Mode>("regular");
  const [scramble, setScramble] = useState<string | null>(null);

  // Skill Timer (stage splits) is a Pro feature — non-Pro users are sent to
  // Pricing instead of switching modes.
  function chooseMode(next: Mode) {
    if (next === "skill" && !isPro) {
      navigate("/app/pricing");
      return;
    }
    setMode(next);
  }
  const [solves, setSolves] = useState<PracticeSolve[]>(
    () => store.getJson<PracticeSolve[]>(SESSION_KEY) ?? [],
  );
  // Personal best survives across sessions and a session reset. Loaded once.
  const [pbMs, setPbMs] = useState<number | null>(
    () => store.getJson<number>(PB_KEY),
  );

  const loadScramble = useCallback(() => {
    setScramble(null);
    nextScramble().then(setScramble);
  }, []);

  useEffect(() => {
    warmUp();
    loadScramble();
  }, [loadScramble]);

  function record(solve: PracticeSolve) {
    setSolves((prev) => {
      const next = [...prev, solve];
      store.setJson(SESSION_KEY, next);
      return next;
    });
    setPbMs((prev) => {
      if (prev !== null && prev <= solve.totalMs) return prev;
      store.setJson(PB_KEY, solve.totalMs);
      return solve.totalMs;
    });
    loadScramble();
  }

  function handleRegular(a: Attempt) {
    // Skip DNFs from the practice stats; +2 folds into the time.
    if (a.dnf) {
      loadScramble();
      return;
    }
    record({ totalMs: a.rawMs + (a.plus2 ? 2000 : 0) });
  }

  function handleSkill(solve: Solve) {
    record({ totalMs: solve.totalMs, stages: solve.stages });
  }

  function resetSession() {
    if (
      solves.length > 0 &&
      !window.confirm(
        `Reset this session? Your ${solves.length} solve${solves.length === 1 ? "" : "s"} will be cleared.`,
      )
    ) {
      return;
    }
    store.remove(SESSION_KEY);
    setSolves([]);
  }

  const summary = sessionSummary(solves);
  const DASH = "—";

  return (
    <div className="screen container skill">
      <div className="timer-mode" role="group" aria-label="Timer mode">
        <button
          className={`timer-mode__btn${mode === "regular" ? " is-active" : ""}`}
          onClick={() => chooseMode("regular")}
          aria-pressed={mode === "regular"}
        >
          Regular
        </button>
        <button
          className={`timer-mode__btn${mode === "skill" ? " is-active" : ""}`}
          onClick={() => chooseMode("skill")}
          aria-pressed={mode === "skill"}
        >
          Skill Timer
          {!isPro && <span className="timer-mode__pro">Pro</span>}
        </button>
      </div>

      {scramble ? (
        mode === "skill" ? (
          <SolveTimer
            key={`s-${solves.length}`}
            scramble={scramble}
            solveNumber={solves.length + 1}
            onComplete={handleSkill}
          />
        ) : (
          <CompTimer
            key={`r-${solves.length}`}
            scramble={scramble}
            solveIndex={solves.length}
            totalSolves={solves.length + 1}
            practice
            onComplete={handleRegular}
          />
        )
      ) : (
        <div className="skill__loading">
          <div className="spinner" />
          <p className="muted">Generating a scramble…</p>
        </div>
      )}

      {
        <div className="card session">
          <div className="session__head">
            <h3 className="session__title">This session</h3>
            <button
              className="btn--ghost btn session__reset"
              onClick={resetSession}
              disabled={solves.length === 0}
            >
              Reset
            </button>
          </div>

          <div className="session__stats">
            <div className="session__stat">
              <span className="session__stat-label">Solves</span>
              <span className="session__stat-value mono">{solves.length}</span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Session best</span>
              <span className="session__stat-value mono">
                {summary.bestMs !== null ? formatMs(summary.bestMs) : DASH}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Personal best</span>
              <span className="session__stat-value mono">
                {pbMs !== null ? formatMs(pbMs) : DASH}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Average</span>
              <span className="session__stat-value mono">
                {summary.meanMs !== null ? formatMs(summary.meanMs) : DASH}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Ao5</span>
              <span className="session__stat-value mono">
                {summary.ao5Ms !== null ? formatMs(summary.ao5Ms) : DASH}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Ao12</span>
              <span className="session__stat-value mono">
                {summary.ao12Ms !== null ? formatMs(summary.ao12Ms) : DASH}
              </span>
            </div>
            {summary.breakdown && (
              <div className="session__stat">
                <span className="session__stat-label">Focus on</span>
                <span className="session__stat-value">
                  {STAGE_LABEL[summary.breakdown.slowest]}{" "}
                  <span className="muted mono session__pct">
                    {Math.round(summary.breakdown.slowestShare * 100)}%
                  </span>
                </span>
              </div>
            )}
          </div>

          {summary.breakdown && (
            <div className="breakdown__bars">
              {STAGE_ORDER.map((key) => {
                const share = summary.breakdown!.grandTotalMs
                  ? summary.breakdown!.totals[key] /
                    summary.breakdown!.grandTotalMs
                  : 0;
                return (
                  <div key={key} className="breakdown__row">
                    <span className="breakdown__label">{STAGE_LABEL[key]}</span>
                    <div className="breakdown__track">
                      <div
                        className={`breakdown__fill${key === summary.breakdown!.slowest ? " is-slowest" : ""}`}
                        style={{ width: `${Math.max(share * 100, 1.5)}%` }}
                      />
                    </div>
                    <span className="breakdown__pct mono">
                      {Math.round(share * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      }
    </div>
  );
}

function sessionSummary(solves: PracticeSolve[]) {
  const totals = solves.map((s) => s.totalMs);
  // Stage breakdown only from Skill-Timer solves (the ones with splits).
  const withStages = solves.filter(
    (s): s is Required<PracticeSolve> => Boolean(s.stages),
  );
  return {
    meanMs: totals.length
      ? totals.reduce((a, b) => a + b, 0) / totals.length
      : null,
    bestMs: totals.length ? Math.min(...totals) : null,
    ao5Ms: rollingAverage(totals, 5),
    ao12Ms: rollingAverage(totals, 12),
    breakdown:
      withStages.length > 0
        ? stageBreakdown(withStages.map((s) => ({ totalMs: s.totalMs, stages: s.stages })))
        : null,
  };
}

/**
 * Rolling average of the last `n` solves, WCA-style: drop the single best and
 * single worst, mean the middle. Sort-then-slice(1, n-1) removes exactly one
 * best and one worst even with ties. Returns null until there are `n` solves.
 * Practice-only (no DNFs) so no DNF handling here.
 */
export function rollingAverage(totalsMs: number[], n: number): number | null {
  if (totalsMs.length < n) return null;
  const window = totalsMs.slice(-n);
  const sorted = [...window].sort((a, b) => a - b);
  const middle = sorted.slice(1, n - 1);
  return middle.reduce((a, b) => a + b, 0) / middle.length;
}
