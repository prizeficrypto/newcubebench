import { useCallback, useEffect, useState } from "react";
import { CompTimer } from "../components/CompTimer.tsx";
import { SolveTimer } from "../components/SolveTimer.tsx";
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

type Mode = "regular" | "skill";
/** A practice solve. Stage splits are present only for Skill-Timer solves. */
type PracticeSolve = { totalMs: number; stages?: Solve["stages"] };

export default function SkillTimer() {
  const [mode, setMode] = useState<Mode>("regular");
  const [scramble, setScramble] = useState<string | null>(null);
  const [solves, setSolves] = useState<PracticeSolve[]>(
    () => store.getJson<PracticeSolve[]>(SESSION_KEY) ?? [],
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

  const summary = solves.length > 0 ? sessionSummary(solves) : null;

  return (
    <div className="screen container skill">
      <div className="timer-mode" role="group" aria-label="Timer mode">
        <button
          className={`timer-mode__btn${mode === "regular" ? " is-active" : ""}`}
          onClick={() => setMode("regular")}
          aria-pressed={mode === "regular"}
        >
          Regular
        </button>
        <button
          className={`timer-mode__btn${mode === "skill" ? " is-active" : ""}`}
          onClick={() => setMode("skill")}
          aria-pressed={mode === "skill"}
        >
          Skill Timer
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

      {summary && (
        <div className="card session">
          <div className="session__head">
            <h3 className="session__title">This session</h3>
            <button className="btn--ghost btn session__reset" onClick={resetSession}>
              Reset
            </button>
          </div>

          <div className="session__stats">
            <div className="session__stat">
              <span className="session__stat-label">Solves</span>
              <span className="session__stat-value mono">{solves.length}</span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Average</span>
              <span className="session__stat-value mono">
                {formatMs(summary.meanMs)}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Best</span>
              <span className="session__stat-value mono">
                {formatMs(summary.bestMs)}
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
      )}
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
    meanMs: totals.reduce((a, b) => a + b, 0) / totals.length,
    bestMs: Math.min(...totals),
    breakdown:
      withStages.length > 0
        ? stageBreakdown(withStages.map((s) => ({ totalMs: s.totalMs, stages: s.stages })))
        : null,
  };
}
