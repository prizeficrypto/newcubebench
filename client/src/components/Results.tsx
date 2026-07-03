import { useEffect, useState } from "react";
import { getRanking, type Competition, type RoundScrambleSet } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import {
  attemptCs,
  formatAttempt,
  formatCentiseconds,
  ordinal,
  placeAverage,
  wcaAo5FromAttempts,
  type Attempt,
} from "../lib/cubing.ts";

/** Self-reported level buckets -> comparable cs ranges. */
const LEVEL_RANGES: Record<string, { name: string; lo: number; hi: number }> = {
  "sub-15": { name: "Fast", lo: 0, hi: 1500 },
  "15–25": { name: "Advanced", lo: 1500, hi: 2500 },
  "25–40": { name: "Intermediate", lo: 2500, hi: 4000 },
  "40–60": { name: "Improving", lo: 4000, hi: 6000 },
  "60+": { name: "Getting started", lo: 6000, hi: Infinity },
  // legacy bucket spellings from the first onboarding
  "Sub-15": { name: "Fast", lo: 0, hi: 1500 },
  "Over 60": { name: "Getting started", lo: 6000, hi: Infinity },
};

function levelContext(avgCs: number, bucket?: string): string | null {
  if (!bucket) return null;
  const range = LEVEL_RANGES[bucket];
  if (!range) return null;
  if (avgCs < range.lo)
    return `faster than the ${bucket}s you told us — time to update your level`;
  if (avgCs < range.hi) return `right in your ${bucket}s range`;
  return `above your ${bucket}s estimate — competition nerves are real, even simulated`;
}

/** Staggered entrance child (fade-up is the product's one reveal). */
function Rise({
  index,
  children,
  className = "",
}: {
  index: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rise${className ? ` ${className}` : ""}`}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {children}
    </div>
  );
}

export function Results({
  comp,
  round,
  attempts,
  onRestart,
}: {
  comp: Competition;
  round: RoundScrambleSet;
  attempts: Attempt[];
  onRestart: () => void;
}) {
  const { user } = useAuth();

  // Official average, DNF-aware: null means the average itself is DNF.
  const avgCs = wcaAo5FromAttempts(attempts);
  const avgText = avgCs === null ? "DNF" : formatCentiseconds(avgCs);

  // Best/worst marking (skipped for a DNF average — nothing "counts").
  const orderVals = attempts.map((a) => (a.dnf ? Infinity : attemptCs(a)));
  const bestIdx = avgCs === null ? -1 : orderVals.indexOf(Math.min(...orderVals));
  const worstIdx =
    avgCs === null ? -1 : orderVals.lastIndexOf(Math.max(...orderVals));

  type Neighbor = { rank: number; name: string; averageCs: number };
  const [ranking, setRanking] = useState<{
    placement: number;
    total: number;
    fastestCs: number | null;
    /** up to 10 real competitors ranked immediately above the user (faster) */
    above: Neighbor[];
    /** up to 10 ranked immediately below (slower) */
    below: Neighbor[];
  } | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (avgCs === null) return; // a DNF average doesn't place
    let cancelled = false;
    setRankError(null);
    setRanking(null);
    if (!round.roundTypeId) {
      setRankError("round could not be identified");
      return;
    }
    getRanking(comp.id, round.roundTypeId)
      .then(({ ranking: r }) => {
        if (cancelled) return;
        if (r.totalCompetitors === 0) {
          setRankError("no official results are published for this round yet");
          return;
        }
        const averages = r.competitors.map((c) => c.averageCs);
        const { placement, total } = placeAverage(avgCs, averages, r.totalCompetitors);
        // The user slots in at index (placement - 1) among the valid field.
        // Real competitors [idx-10, idx) rank above; [idx, idx+10) below.
        const idx = placement - 1;
        const toNeighbor = (c: { name: string; averageCs: number }, i: number) => ({
          // ranks shift down by one below the user's inserted slot
          rank: i < idx ? i + 1 : i + 2,
          name: c.name,
          averageCs: c.averageCs,
        });
        const above = r.competitors
          .slice(Math.max(0, idx - 10), idx)
          .map((c, k) => toNeighbor(c, Math.max(0, idx - 10) + k));
        const below = r.competitors
          .slice(idx, idx + 10)
          .map((c, k) => toNeighbor(c, idx + k));
        setRanking({ placement, total, fastestCs: r.fastestAverage, above, below });
      })
      .catch((err) => {
        if (!cancelled)
          setRankError(err instanceof Error ? err.message : "Ranking unavailable");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.id, retryNonce]);

  const context =
    avgCs !== null && ranking
      ? levelContext(avgCs, user?.profile.avg333)
      : null;

  return (
    <div className="screen container results">
      <Rise index={0} className="results__head">
        <span className="eyebrow">Your result</span>
        <div className="avg-mask" aria-label={`Average ${avgText}`}>
          <div className="results__avg mono avg-rise">{avgText}</div>
        </div>
        <p className="muted results__avg-label">
          {avgCs === null ? "WCA average of 5 — DNF" : "WCA average of 5"}
        </p>
      </Rise>

      <Rise index={1} className="results__rank-wrap">
        <div className="card results__rank">
          {avgCs === null && (
            <p className="results__rank-line">
              Two or more DNFs make the average itself a DNF — in an official
              round this wouldn't place. Solve the round again and keep it
              clean.
            </p>
          )}
          {avgCs !== null && !ranking && !rankError && (
            <div className="state-center">
              <div className="spinner" />
            </div>
          )}
          {avgCs !== null && rankError && (
            <div className="results__rank-error">
              <p className="muted">
                Couldn't place you ({rankError}). Your average is still{" "}
                {avgText}.
              </p>
              <button
                className="btn btn--secondary results__retry"
                onClick={() => setRetryNonce((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {avgCs !== null && ranking && (
            <>
              <p className="results__rank-line">
                Your average of <strong className="mono">{avgText}</strong>{" "}
                would have placed{" "}
                <strong className="accent mono">
                  {ordinal(ranking.placement)}
                </strong>{" "}
                of <strong className="mono">{ranking.total}</strong>
              </p>
              <p className="muted results__rank-sub">
                {round.roundName ?? "First round"} of 3×3 at {comp.name}
                {ranking.fastestCs != null && (
                  <> · winner averaged {formatCentiseconds(ranking.fastestCs)}</>
                )}
              </p>
              <p className="tertiary results__context">
                Top {Math.max(1, Math.ceil((ranking.placement / ranking.total) * 100))}%
                of the field{context && <> · {context}</>}
              </p>
            </>
          )}
        </div>
      </Rise>

      {ranking && (ranking.above.length > 0 || ranking.below.length > 0) && (
        <Rise index={2} className="results__board-wrap">
          <div className="card board">
            <div className="board__head">
              <span className="eyebrow">Where you'd slot in</span>
              <span className="tertiary board__sub">
                Real competitors around your average
              </span>
            </div>
            <div className="board__rows">
              {ranking.above.map((n) => (
                <div className="board__row" key={`a-${n.rank}`}>
                  <span className="board__rank mono">{ordinal(n.rank)}</span>
                  <span className="board__name">{n.name}</span>
                  <span className="board__time mono">
                    {formatCentiseconds(n.averageCs)}
                  </span>
                </div>
              ))}
              <div className="board__row board__row--you">
                <span className="board__rank mono">{ordinal(ranking.placement)}</span>
                <span className="board__name">You</span>
                <span className="board__time mono">{avgText}</span>
              </div>
              {ranking.below.map((n) => (
                <div className="board__row" key={`b-${n.rank}`}>
                  <span className="board__rank mono">{ordinal(n.rank)}</span>
                  <span className="board__name">{n.name}</span>
                  <span className="board__time mono">
                    {formatCentiseconds(n.averageCs)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Rise>
      )}

      <Rise index={3}>
        <div className="results__solves">
          {attempts.map((a, i) => {
            const dropped = i === bestIdx || i === worstIdx;
            return (
              <div
                key={i}
                className={`solve-pill${dropped ? " is-dropped" : ""}${a.dnf ? " is-dnf" : ""}`}
              >
                <span className="tertiary">{i + 1}</span>
                <span className="mono">{formatAttempt(a)}</span>
                {i === bestIdx && <span className="solve-pill__tag">best</span>}
                {i === worstIdx && <span className="solve-pill__tag">worst</span>}
              </div>
            );
          })}
        </div>
      </Rise>

      <Rise index={4}>
        <p className="tertiary results__drop-note">
          Best and worst are dropped — the average is the mean of the middle
          three.
          {attempts.some((a) => a.plus2 && !a.dnf) &&
            " A “+” marks a +2 penalty."}
          {attempts.some((a) => a.dnf) && " A DNF counts as the worst attempt."}
        </p>
      </Rise>

      <Rise index={5}>
        <button className="btn btn--secondary" onClick={onRestart}>
          Try another competition
        </button>
      </Rise>
    </div>
  );
}
