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
/** Personal bests (ms) persisted across sessions — 3x3 practice. */
const PB_KEY = "cb_timer_pb_v1";
const PB_AO5_KEY = "cb_timer_pb_ao5_v1";
const PB_AO12_KEY = "cb_timer_pb_ao12_v1";

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
    if (next === "skill" && !user) {
      navigate("/join"); // guests: create an account first
      return;
    }
    if (next === "skill" && !isPro) {
      navigate("/app/pricing");
      return;
    }
    setMode(next);
  }
  const [solves, setSolves] = useState<PracticeSolve[]>(
    () => store.getJson<PracticeSolve[]>(SESSION_KEY) ?? [],
  );
  // Personal bests survive across sessions and a session reset. Loaded once.
  const [pbMs, setPbMs] = useState<number | null>(
    () => store.getJson<number>(PB_KEY),
  );
  const [pbAo5Ms, setPbAo5Ms] = useState<number | null>(
    () => store.getJson<number>(PB_AO5_KEY),
  );
  const [pbAo12Ms, setPbAo12Ms] = useState<number | null>(
    () => store.getJson<number>(PB_AO12_KEY),
  );

  const loadScramble = useCallback(() => {
    setScramble(null);
    nextScramble().then(setScramble);
  }, []);

  useEffect(() => {
    warmUp();
    loadScramble();
  }, [loadScramble]);

  // Whenever a solve lands, capture new all-time best rolling averages. Each
  // new solve makes exactly one new 5- and 12-window "current", so checking
  // the latest window on every change captures every window's best.
  useEffect(() => {
    if (solves.length === 0) return;
    const totals = solves.map((s) => s.totalMs);
    const a5 = rollingAverage(totals, 5);
    if (a5 !== null) {
      setPbAo5Ms((p) => {
        if (p !== null && p <= a5) return p;
        store.setJson(PB_AO5_KEY, a5);
        return a5;
      });
    }
    const a12 = rollingAverage(totals, 12);
    if (a12 !== null) {
      setPbAo12Ms((p) => {
        if (p !== null && p <= a12) return p;
        store.setJson(PB_AO12_KEY, a12);
        return a12;
      });
    }
  }, [solves]);

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
    <div className="screen container--wide skill">
      <div className="skill__layout">
        <div className="skill__main">
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
        </div>

        <aside className="skill__side">

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
            <div className="session__stat">
              <span className="session__stat-label">Worst</span>
              <span className="session__stat-value mono">
                {summary.worstMs !== null ? formatMs(summary.worstMs) : DASH}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Consistency</span>
              <span className="session__stat-value mono">
                {summary.stdevMs !== null ? `±${formatMs(summary.stdevMs)}` : DASH}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Best Ao5</span>
              <span className="session__stat-value mono">
                {pbAo5Ms !== null ? formatMs(pbAo5Ms) : DASH}
              </span>
            </div>
            <div className="session__stat">
              <span className="session__stat-label">Best Ao12</span>
              <span className="session__stat-value mono">
                {pbAo12Ms !== null ? formatMs(pbAo12Ms) : DASH}
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

          <TimeGraph times={solves.map((s) => s.totalMs)} />

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

          {solves.length > 0 && (
            <div className="recent">
              <span className="eyebrow">Recent solves</span>
              <div className="recent__list">
                {solves
                  .map((s, i) => ({ t: s.totalMs, n: i + 1 }))
                  .slice(-12)
                  .reverse()
                  .map((r) => (
                    <span key={r.n} className="recent__item">
                      <span className="tertiary recent__n">{r.n}</span>
                      <span className="mono">{formatMs(r.t)}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      }
        </aside>
      </div>
    </div>
  );
}

/**
 * Session time graph: each solve plotted in order, newest at the right. Pure
 * inline SVG (no chart lib) — a calm line + dots, scaled to the session's
 * range. Needs at least 2 solves.
 */
function TimeGraph({ times }: { times: number[] }) {
  if (times.length < 2) return null;
  const W = 640;
  const H = 150;
  const PAD = 12;
  const max = Math.max(...times);
  const min = Math.min(...times);
  const range = max - min || 1;
  const x = (i: number) => PAD + (i / (times.length - 1)) * (W - 2 * PAD);
  const y = (t: number) => PAD + (1 - (t - min) / range) * (H - 2 * PAD);
  const line = times.map((t, i) => `${x(i).toFixed(1)},${y(t).toFixed(1)}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  return (
    <div className="timegraph">
      <div className="timegraph__head">
        <span className="eyebrow">Session times</span>
        <span className="tertiary timegraph__range mono">
          {formatMs(min)} – {formatMs(max)}
        </span>
      </div>
      <svg
        className="timegraph__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Your ${times.length} session times, plotted in order`}
      >
        <polygon className="timegraph__area" points={area} />
        <polyline className="timegraph__line" points={line} fill="none" />
        {times.map((t, i) => (
          <circle
            key={i}
            className="timegraph__dot"
            cx={x(i)}
            cy={y(t)}
            r={2.5}
          />
        ))}
      </svg>
    </div>
  );
}

function sessionSummary(solves: PracticeSolve[]) {
  const totals = solves.map((s) => s.totalMs);
  // Stage breakdown only from Skill-Timer solves (the ones with splits).
  const withStages = solves.filter(
    (s): s is Required<PracticeSolve> => Boolean(s.stages),
  );
  const meanMs = totals.length
    ? totals.reduce((a, b) => a + b, 0) / totals.length
    : null;
  // Consistency = sample standard deviation (lower is steadier). Needs 2+.
  const stdevMs =
    totals.length >= 2 && meanMs !== null
      ? Math.sqrt(
          totals.reduce((s, t) => s + (t - meanMs) ** 2, 0) /
            (totals.length - 1),
        )
      : null;
  return {
    meanMs,
    bestMs: totals.length ? Math.min(...totals) : null,
    worstMs: totals.length ? Math.max(...totals) : null,
    stdevMs,
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
