import { useState } from "react";
import {
  getRound,
  type Competition,
  type RoundMeta,
  type RoundScrambleSet,
} from "../lib/api.ts";
import type { Attempt } from "../lib/cubing.ts";
import { store } from "../lib/store.ts";
import { CompetitionPicker } from "../components/CompetitionPicker.tsx";
import { Solving } from "../components/Solving.tsx";
import { Results } from "../components/Results.tsx";

type Step = "picking" | "rounds" | "loadingRound" | "solving" | "results";

const ROUND_KEY = "cb_round_v1";

type SavedRound = {
  comp: Competition;
  round: RoundScrambleSet;
  attempts: Attempt[];
  savedAt: string;
};

/**
 * Competition Simulator. Pick a competition → pick a round (competitions have
 * several: first round through the final) → solve its five real scrambles →
 * see where you'd have placed in that round. In-progress rounds persist, so a
 * refresh resumes rather than losing solves.
 */
export default function Simulator() {
  const [step, setStep] = useState<Step>("picking");
  const [comp, setComp] = useState<Competition | null>(null);
  const [rounds, setRounds] = useState<RoundMeta[]>([]);
  const [round, setRound] = useState<RoundScrambleSet | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRound | null>(() => {
    const s = store.getJson<SavedRound>(ROUND_KEY);
    return s && s.attempts.length > 0 && s.attempts.length < 5 ? s : null;
  });

  // Load a specific round's scrambles, then start solving it.
  async function loadRound(c: Competition, meta: RoundMeta) {
    setStep("loadingRound");
    setRoundError(null);
    try {
      const { round: r } = await getRound(c.id, meta.roundTypeId);
      if (r.available && r.scrambles && r.scrambles.length >= 5) {
        setRound(r);
        setAttempts([]);
        setStep("solving");
      } else {
        setRoundError(r.reason ?? "That round isn't available.");
        setStep("rounds");
      }
    } catch (err) {
      setRoundError(err instanceof Error ? err.message : "Couldn't load that round.");
      setStep("rounds");
    }
  }

  function chooseCompetition(c: Competition, rs: RoundMeta[]) {
    setComp(c);
    setRounds(rs);
    setRoundError(null);
    // Skip the chooser when there's only one round.
    if (rs.length === 1) loadRound(c, rs[0]);
    else setStep("rounds");
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
    setRounds([]);
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
                  <span className="resume__name">
                    {saved.comp.name}
                    {saved.round.roundName ? ` · ${saved.round.roundName}` : ""}
                  </span>
                  <span className="tertiary resume__meta">
                    {saved.attempts.length} of 5 solves done
                  </span>
                </div>
                <div className="resume__actions">
                  <button
                    className="btn"
                    onClick={() => {
                      setComp(saved.comp);
                      setRound(saved.round);
                      setAttempts(saved.attempts);
                      setStep("solving");
                    }}
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
          <CompetitionPicker onProceed={chooseCompetition} />
        </>
      )}

      {(step === "rounds" || step === "loadingRound") && comp && (
        <RoundChooser
          comp={comp}
          rounds={rounds}
          loading={step === "loadingRound"}
          error={roundError}
          onChoose={(meta) => loadRound(comp, meta)}
          onBack={reset}
        />
      )}

      {step === "solving" && comp && round?.scrambles && (
        <Solving
          scrambles={round.scrambles}
          roundName={round.roundName}
          attempts={attempts}
          onAttempt={handleAttempt}
          onBack={() => setStep(rounds.length > 1 ? "rounds" : "picking")}
        />
      )}

      {step === "results" && comp && round && attempts.length === 5 && (
        <Results comp={comp} round={round} attempts={attempts} onRestart={reset} />
      )}
    </>
  );
}

function RoundChooser({
  comp,
  rounds,
  loading,
  error,
  onChoose,
  onBack,
}: {
  comp: Competition;
  rounds: RoundMeta[];
  loading: boolean;
  error: string | null;
  onChoose: (meta: RoundMeta) => void;
  onBack: () => void;
}) {
  return (
    <div className="screen container picker">
      <div className="picker__head">
        <button className="btn--ghost btn picker__back" onClick={onBack}>
          ‹ Competitions
        </button>
        <span className="eyebrow">Step 2</span>
        <h2 className="title">Choose a round</h2>
        <p className="muted">
          {comp.name} ran {rounds.length} round{rounds.length === 1 ? "" : "s"} of
          3×3. Solve any of them — later rounds are the field that advanced.
        </p>
      </div>

      {error && <p className="gate__error round-choose__error">{error}</p>}

      <div className="round-choose">
        {rounds.map((r, i) => (
          <button
            key={r.roundTypeId}
            className="lvl round-choose__row"
            disabled={loading}
            onClick={() => onChoose(r)}
          >
            <span className="lvl__label">{r.roundName}</span>
            <span className="lvl__range mono">
              {i === 0 ? "everyone" : "advanced"} ›
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="state-center">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
