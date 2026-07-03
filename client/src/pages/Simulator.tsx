import { useState } from "react";
import type { Competition, RoundScrambleSet } from "../lib/api.ts";
import type { Attempt } from "../lib/cubing.ts";
import { store } from "../lib/store.ts";
import { CompetitionPicker } from "../components/CompetitionPicker.tsx";
import { Solving } from "../components/Solving.tsx";
import { Results } from "../components/Results.tsx";

type Step = "picking" | "solving" | "results";

const ROUND_KEY = "cb_round_v1";

type SavedRound = {
  comp: Competition;
  round: RoundScrambleSet;
  attempts: Attempt[];
  savedAt: string;
};

/**
 * Competition Simulator. The in-progress round is persisted after every
 * attempt, so a refresh, tab close, or a wander to Pricing never destroys
 * solves — you resume from the competition list.
 */
export default function Simulator() {
  const [step, setStep] = useState<Step>("picking");
  const [comp, setComp] = useState<Competition | null>(null);
  const [round, setRound] = useState<RoundScrambleSet | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [saved, setSaved] = useState<SavedRound | null>(() => {
    const s = store.getJson<SavedRound>(ROUND_KEY);
    // only a genuinely in-progress round is worth offering
    return s && s.attempts.length > 0 && s.attempts.length < 5 ? s : null;
  });

  function startRound(c: Competition, r: RoundScrambleSet, a: Attempt[] = []) {
    setComp(c);
    setRound(r);
    setAttempts(a);
    setStep("solving");
  }

  function handleAttempt(attempt: Attempt) {
    if (!comp || !round) return;
    const next = [...attempts, attempt];
    setAttempts(next);
    if (next.length >= 5) {
      store.remove(ROUND_KEY);
      setSaved(null);
      setStep("results");
    } else {
      const snapshot: SavedRound = {
        comp,
        round,
        attempts: next,
        savedAt: new Date().toISOString(),
      };
      store.setJson(ROUND_KEY, snapshot);
      setSaved(snapshot);
    }
  }

  function discardSaved() {
    if (
      saved &&
      !window.confirm(
        `Discard your paused round at ${saved.comp.name}? ${saved.attempts.length} solve${saved.attempts.length === 1 ? "" : "s"} will be lost.`,
      )
    ) {
      return;
    }
    store.remove(ROUND_KEY);
    setSaved(null);
  }

  function reset() {
    setComp(null);
    setRound(null);
    setAttempts([]);
    setStep("picking");
  }

  return (
    <>
      {step === "picking" && (
        <>
          {saved && (
            <div className="screen container resume">
              <div className="card resume__card">
                <div className="resume__info">
                  <span className="eyebrow">Paused round</span>
                  <span className="resume__name">{saved.comp.name}</span>
                  <span className="tertiary resume__meta">
                    {saved.attempts.length} of 5 solves done
                  </span>
                </div>
                <div className="resume__actions">
                  <button
                    className="btn"
                    onClick={() =>
                      startRound(saved.comp, saved.round, saved.attempts)
                    }
                  >
                    Resume
                  </button>
                  <button className="btn btn--ghost" onClick={discardSaved}>
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}
          <CompetitionPicker onProceed={(c, r) => startRound(c, r)} />
        </>
      )}

      {step === "solving" && comp && round?.scrambles && (
        <Solving
          scrambles={round.scrambles}
          attempts={attempts}
          onAttempt={handleAttempt}
          onBack={() => setStep("picking")}
        />
      )}

      {step === "results" && comp && round && attempts.length === 5 && (
        <Results comp={comp} round={round} attempts={attempts} onRestart={reset} />
      )}
    </>
  );
}
