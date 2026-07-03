import { formatAttempt, type Attempt } from "../lib/cubing.ts";
import { CompTimer } from "./CompTimer.tsx";

/**
 * The five attempts of a simulated round. Progress is the product's text
 * counter plus the actual times so far — cubers do the "what do I need on
 * the last one" math constantly, so the data stays visible. Attempts live in
 * the parent (persisted after each solve); leaving mid-round just pauses it.
 */
export function Solving({
  scrambles,
  attempts,
  onAttempt,
  onBack,
}: {
  scrambles: string[];
  attempts: Attempt[];
  onAttempt: (attempt: Attempt) => void;
  onBack: () => void;
}) {
  const solveScrambles = scrambles.slice(0, 5);
  const total = solveScrambles.length;
  const index = attempts.length;

  return (
    <div className="screen container solving">
      <div className="solving__bar">
        <button className="btn--ghost btn" onClick={onBack}>
          ‹ Back
        </button>
        <span className="solving__count mono" aria-label={`Solve ${index + 1} of ${total}`}>
          {index + 1} / {total}
        </span>
        <div className="solving__times mono" aria-label="Times so far">
          {attempts.map((a, i) => (
            <span key={i} className="solving__time">
              {formatAttempt(a)}
            </span>
          ))}
        </div>
      </div>

      <CompTimer
        key={index}
        scramble={solveScrambles[index]}
        solveIndex={index}
        totalSolves={total}
        onComplete={onAttempt}
      />
    </div>
  );
}
