import { useEffect, useRef, useState } from "react";
import {
  getCutoff,
  getEvents,
  getRounds,
  getRound,
  prefetchRanking,
  type Competition,
  type Cutoff,
  type EventMeta,
  type RoundMeta,
  type RoundScrambleSet,
} from "../lib/api.ts";
import { missedCutoff, type Attempt } from "../lib/cubing.ts";
import { eventOrDefault, type ClientEvent } from "../lib/events.ts";
import { store } from "../lib/store.ts";
import { CompetitionPicker } from "../components/CompetitionPicker.tsx";
import { Solving } from "../components/Solving.tsx";
import { Results } from "../components/Results.tsx";
import { Mark } from "../components/Mark.tsx";
import { useT } from "../lib/i18n.tsx";

type Step =
  | "picking"
  | "events"
  | "rounds"
  | "loadingRound"
  | "solving"
  | "results"
  | "qualified";

// v2 stores the event id so a resumed round restores the right event + solve
// count (a v1 snapshot assumed 3x3 / 5 solves and is intentionally ignored).
const ROUND_KEY = "cb_round_v2";

type SavedRound = {
  comp: Competition;
  eventId: string;
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
  const { t } = useT();
  const [step, setStep] = useState<Step>("picking");
  const [comp, setComp] = useState<Competition | null>(null);
  const [events, setEvents] = useState<EventMeta[]>([]);
  const [event, setEvent] = useState<ClientEvent>(eventOrDefault("333"));
  const [rounds, setRounds] = useState<RoundMeta[]>([]);
  const [round, setRound] = useState<RoundScrambleSet | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const requiredAttempts = event.solves;
  // advancing to a round the user just qualified for
  const [advanceTo, setAdvanceTo] = useState<{
    compId: string;
    eventId: string;
    roundTypeId: string;
    roundName: string;
  } | null>(null);
  const [advanceRound, setAdvanceRound] = useState<RoundScrambleSet | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  // guards for the background preload: ignore stale/duplicate fetch results
  const advanceReqRef = useRef(0);
  // Bumped whenever the user moves on (new comp, event, round, reset, resume):
  // a slow response for an earlier choice is then ignored instead of
  // pairing the wrong competition with the wrong scrambles.
  const flowRef = useRef(0);
  // Bumped by a group switch and by every new attempt: a switch that lands
  // after the user kept solving is dropped rather than wiping their attempts.
  const groupReqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const [saved, setSaved] = useState<SavedRound | null>(() => {
    const s = store.getJson<SavedRound>(ROUND_KEY);
    if (!s || !s.eventId) return null;
    const need = eventOrDefault(s.eventId).solves;
    return s.attempts.length > 0 && s.attempts.length < need ? s : null;
  });

  // The round's cutoff (combined rounds), fetched in the background so it
  // never delays starting. If it lands after the cutoff attempts were already
  // solved and missed, the round ends at that point.
  const [cutoff, setCutoff] = useState<Cutoff | null>(null);
  useEffect(() => {
    setCutoff(null);
    if (!comp || !round?.roundTypeId) return;
    let live = true;
    getCutoff(comp.id, round.roundTypeId, event.id)
      .then((r) => live && setCutoff(r.cutoff))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [comp?.id, event.id, round?.roundTypeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== "solving" || !cutoff || attempts.length < cutoff.numberOfAttempts) return;
    const first = attempts.slice(0, cutoff.numberOfAttempts);
    if (attempts.length < requiredAttempts && missedCutoff(first, cutoff)) {
      setAttempts(first);
      store.remove(ROUND_KEY);
      setSaved(null);
      setStep("results");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoff]);

  // Deep link (?comp=WC2019&event=333&round=1), e.g. "Try this round
  // yourself" from a shared result: open straight into that round.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const compId = q.get("comp");
    if (!compId) return;
    const evId = q.get("event") ?? "333";
    const roundId = q.get("round");
    (async () => {
      const { competition, events: evs } = await getEvents(compId);
      setComp(competition);
      setEvents(evs);
      if (!evs.some((e) => e.id === evId)) {
        setStep("events");
        return;
      }
      const ev = eventOrDefault(evId);
      setEvent(ev);
      const { rounds: rs } = await getRounds(compId, evId);
      setRounds(rs);
      const meta = rs.find((r) => r.roundTypeId === roundId) ?? (rs.length === 1 ? rs[0] : undefined);
      if (meta) void loadRound(competition, ev, meta);
      else setStep(rs.length ? "rounds" : "events");
    })().catch(() => setStep("picking"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a specific round's scrambles for the current event, then start it.
  async function loadRound(c: Competition, ev: ClientEvent, meta: RoundMeta) {
    const flow = ++flowRef.current;
    setStep("loadingRound");
    setRoundError(null);
    try {
      const { round: r } = await getRound(c.id, meta.roundTypeId, ev.id);
      if (flow !== flowRef.current) return;
      if (r.available && r.scrambles && r.scrambles.length >= ev.solves) {
        // The ranking downloads while the user solves: results are instant.
        prefetchRanking(c.id, r.roundTypeId ?? meta.roundTypeId, ev.id);
        setRound(r);
        setAttempts([]);
        setStep("solving");
      } else {
        setRoundError(r.reason ?? "That round isn't available.");
        setStep("rounds");
      }
    } catch (err) {
      if (flow !== flowRef.current) return;
      setRoundError(err instanceof Error ? err.message : "Couldn't load that round.");
      setStep("rounds");
    }
  }

  // Qualified for the next round: show the celebration and preload its
  // scrambles in the background so continuing is instant (smooth, no spinner).
  function advance(roundTypeId: string, roundName: string) {
    if (!comp) return;
    // Already loaded this exact round (e.g. returned from "Back to results"
    // and clicked again): reuse it, no refetch, no loading flash.
    if (
      advanceTo?.compId === comp.id &&
      advanceTo.eventId === event.id &&
      advanceTo.roundTypeId === roundTypeId &&
      advanceRound
    ) {
      setStep("qualified");
      return;
    }
    setAdvanceTo({ compId: comp.id, eventId: event.id, roundTypeId, roundName });
    setAdvanceRound(null);
    setAdvanceError(null);
    setStep("qualified");
    const reqId = ++advanceReqRef.current;
    getRound(comp.id, roundTypeId, event.id)
      .then(({ round: r }) => {
        // ignore if a newer request superseded this or we unmounted
        if (reqId !== advanceReqRef.current || !mountedRef.current) return;
        if (r.available && r.scrambles && r.scrambles.length >= event.solves) {
          setAdvanceRound(r);
        } else {
          setAdvanceError(r.reason ?? "That round isn't available.");
        }
      })
      .catch((err) => {
        if (reqId !== advanceReqRef.current || !mountedRef.current) return;
        setAdvanceError(
          err instanceof Error ? err.message : "Couldn't load that round.",
        );
      });
  }

  // Begin the round we just celebrated qualifying for.
  function startAdvancedRound() {
    if (!advanceRound) return;
    if (comp && advanceRound.roundTypeId) prefetchRanking(comp.id, advanceRound.roundTypeId, event.id);
    setRound(advanceRound);
    setAttempts([]);
    setAdvanceTo(null);
    setAdvanceRound(null);
    setStep("solving");
  }

  // Competition picked: show the event chooser (fetched events from picker).
  function chooseCompetition(c: Competition, evs: EventMeta[]) {
    setComp(c);
    setEvents(evs);
    setEventsError(null);
    setRoundError(null);
    // Show the event step right away (it carries the loading state and any
    // error); with a single event, go straight on to its rounds.
    setStep("events");
    if (evs.length === 1) void chooseEvent(c, evs[0]);
  }

  // Event picked: fetch that event's rounds, then choose a round.
  async function chooseEvent(c: Competition, evMeta: EventMeta) {
    const flow = ++flowRef.current;
    const ev = eventOrDefault(evMeta.id);
    setEvent(ev);
    setEventsLoading(true);
    setEventsError(null);
    setRoundError(null);
    try {
      const { available, reason, rounds: rs } = await getRounds(c.id, ev.id);
      if (flow !== flowRef.current) return;
      setEventsLoading(false);
      if (available && rs.length > 0) {
        setRounds(rs);
        // Skip the round chooser when there's only one round.
        if (rs.length === 1) loadRound(c, ev, rs[0]);
        else setStep("rounds");
      } else {
        setEventsError(reason ?? "That event isn't available.");
      }
    } catch (err) {
      if (flow !== flowRef.current) return;
      setEventsLoading(false);
      setEventsError(
        err instanceof Error ? err.message : "Couldn't load that event.",
      );
    }
  }

  // Switch to a different scramble group of the current round. Groups hold
  // different scrambles, so the attempts so far can't carry over — switching
  // clears them (with a confirm once any solve is in).
  async function changeGroup(groupId: string) {
    if (!comp || !round?.roundTypeId || groupBusy) return;
    if (groupId === round.groupId) return;
    if (
      attempts.length > 0 &&
      !window.confirm(
        `${t("Switch to Group")} ${groupId}? ${attempts.length} ${attempts.length === 1 ? t("solve will be cleared.") : t("solves will be cleared.")}`,
      )
    ) {
      return;
    }
    const req = ++groupReqRef.current;
    setGroupBusy(true);
    setRoundError(null);
    try {
      const { round: r } = await getRound(comp.id, round.roundTypeId, event.id, groupId);
      if (req !== groupReqRef.current) return; // the user kept solving, or left
      if (r.available && r.groupId === groupId && r.scrambles && r.scrambles.length >= event.solves) {
        setRound(r);
        setAttempts([]);
        store.remove(ROUND_KEY);
        setSaved(null);
      } else {
        setRoundError(r.reason ?? "That group isn't available.");
      }
    } catch (err) {
      setRoundError(err instanceof Error ? err.message : "Couldn't load that group.");
    } finally {
      setGroupBusy(false);
    }
  }

  function handleAttempt(attempt: Attempt) {
    if (!comp || !round) return;
    groupReqRef.current++; // a pending group switch must not clear this attempt
    const next = [...attempts, attempt];
    setAttempts(next);
    // A missed cutoff ends the round right there, as it would officially.
    const stoppedByCutoff =
      cutoff !== null && next.length === cutoff.numberOfAttempts && missedCutoff(next, cutoff);
    if (next.length >= requiredAttempts || stoppedByCutoff) {
      store.remove(ROUND_KEY);
      setSaved(null);
      setStep("results");
    } else {
      const snapshot: SavedRound = {
        comp,
        eventId: event.id,
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
        `${t("Discard your paused round at")} ${saved.comp.name}? ${saved.attempts.length} ${saved.attempts.length === 1 ? t("solve will be lost.") : t("solves will be lost.")}`,
      )
    ) {
      return;
    }
    store.remove(ROUND_KEY);
    setSaved(null);
  }

  // Leaving an in-progress round (Back from Solving) abandons it: the lifted
  // attempts are dropped and the persisted snapshot is cleared, so it can't
  // resurrect as a stale resume card later.
  function leaveRound() {
    store.remove(ROUND_KEY);
    setSaved(null);
    setAttempts([]);
    setStep(
      rounds.length > 1 ? "rounds" : events.length > 1 ? "events" : "picking",
    );
  }

  function reset() {
    flowRef.current++;
    groupReqRef.current++;
    advanceReqRef.current++;
    setAdvanceTo(null);
    setAdvanceRound(null);
    setAdvanceError(null);
    store.remove(ROUND_KEY);
    setSaved(null);
    setComp(null);
    setEvents([]);
    setEvent(eventOrDefault("333"));
    setRounds([]);
    setRound(null);
    setAttempts([]);
    setStep("picking");
  }

  // Back from the round chooser -> event chooser (or the picker if the comp
  // held only one event).
  function backToEvents() {
    setRoundError(null);
    setStep(events.length > 1 ? "events" : "picking");
  }

  return (
    <>
      {step === "picking" && (
        <>
          {saved && (
            <div className="screen container resume">
              <div className="card resume__card">
                <div className="resume__info">
                  <span className="eyebrow">{t("Paused round")}</span>
                  <span className="resume__name">
                    {saved.comp.name}
                    {saved.round.roundName ? ` · ${saved.round.roundName}` : ""}
                  </span>
                  <span className="tertiary resume__meta">
                    {saved.attempts.length} {t("of")} {eventOrDefault(saved.eventId).solves}{" "}
                    {t("solves done")} · {eventOrDefault(saved.eventId).display}
                  </span>
                </div>
                <div className="resume__actions">
                  <button
                    className="btn"
                    onClick={() => {
                      flowRef.current++;
                      advanceReqRef.current++;
                      setAdvanceTo(null);
                      setAdvanceRound(null);
                      // Back from a resumed round goes to the picker, not to a
                      // round list left over from another competition.
                      setEvents([]);
                      setRounds([]);
                      if (saved.round.roundTypeId) {
                        prefetchRanking(saved.comp.id, saved.round.roundTypeId, saved.eventId);
                      }
                      setComp(saved.comp);
                      setEvent(eventOrDefault(saved.eventId));
                      setRound(saved.round);
                      setAttempts(saved.attempts);
                      setStep("solving");
                    }}
                  >
                    {t("Resume")}
                  </button>
                  <button className="btn btn--ghost" onClick={discardSaved}>
                    {t("Discard")}
                  </button>
                </div>
              </div>
            </div>
          )}
          <CompetitionPicker onProceed={chooseCompetition} />
        </>
      )}

      {step === "events" && comp && (
        <EventChooser
          comp={comp}
          events={events}
          loading={eventsLoading}
          error={eventsError}
          onChoose={(evMeta) => chooseEvent(comp, evMeta)}
          onBack={reset}
        />
      )}

      {(step === "rounds" || step === "loadingRound") && comp && (
        <RoundChooser
          comp={comp}
          event={event}
          rounds={rounds}
          loading={step === "loadingRound"}
          error={roundError}
          onChoose={(meta) => loadRound(comp, event, meta)}
          onBack={backToEvents}
        />
      )}

      {step === "solving" && comp && round?.scrambles && (
        <Solving
          comp={comp}
          event={event}
          scrambles={round.scrambles}
          round={round}
          roundName={round.roundName}
          attempts={attempts}
          onAttempt={handleAttempt}
          onChangeGroup={changeGroup}
          groupBusy={groupBusy}
          onBack={leaveRound}
          cutoff={cutoff}
        />
      )}

      {step === "results" &&
        comp &&
        round &&
        attempts.length === requiredAttempts && (
          <Results
            comp={comp}
            event={event}
            round={round}
            attempts={attempts}
            onRestart={reset}
            onAdvance={advance}
            cutoff={cutoff}
          />
        )}

      {step === "qualified" && advanceTo && (
        <Qualified
          roundName={advanceTo.roundName}
          ready={Boolean(advanceRound)}
          error={advanceError}
          onStart={startAdvancedRound}
          onBack={() => setStep("results")}
          onRetry={() => advance(advanceTo.roundTypeId, advanceTo.roundName)}
        />
      )}
    </>
  );
}

/** Pick which event of a competition to simulate (2x2, 3x3, …). */
function EventChooser({
  comp,
  events,
  loading,
  error,
  onChoose,
  onBack,
}: {
  comp: Competition;
  events: EventMeta[];
  loading: boolean;
  error: string | null;
  onChoose: (event: EventMeta) => void;
  onBack: () => void;
}) {
  const { t } = useT();
  return (
    <div className="screen container picker">
      <div className="picker__head">
        <button className="btn--ghost btn picker__back" onClick={onBack}>
          ‹ {t("Competitions")}
        </button>
        <span className="eyebrow">{t("Step 2")}</span>
        <h2 className="title">{t("Choose an event")}</h2>
        <p className="muted">
          {comp.name} {t("held")} {events.length}{" "}
          {events.length === 1 ? t("event you can simulate. Pick one to see its rounds.") : t("events you can simulate. Pick one to see its rounds.")}
        </p>
      </div>

      {error && <p className="gate__error round-choose__error">{error}</p>}

      <div className="round-choose">
        {events.map((e) => {
          const ev = eventOrDefault(e.id);
          return (
            <button
              key={e.id}
              className="lvl round-choose__row"
              disabled={loading}
              onClick={() => onChoose(e)}
            >
              <span className="lvl__label">{ev.display}</span>
              <span className="ev-fmt">
                <span className="ev-fmt__tag">
                  {ev.format === "mo3" ? t("Mean of 3") : t("Average of 5")}
                </span>
                <span className="ev-fmt__chev" aria-hidden="true">
                  ›
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="picker__plan-note tertiary">
        {t("Blindfolded and Fewest Moves events aren't supported yet.")}
      </p>

      {loading && (
        <div className="state-center">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}

function RoundChooser({
  comp,
  event,
  rounds,
  loading,
  error,
  onChoose,
  onBack,
}: {
  comp: Competition;
  event: ClientEvent;
  rounds: RoundMeta[];
  loading: boolean;
  error: string | null;
  onChoose: (meta: RoundMeta) => void;
  onBack: () => void;
}) {
  const { t } = useT();
  return (
    <div className="screen container picker">
      <div className="picker__head">
        <button className="btn--ghost btn picker__back" onClick={onBack}>
          ‹ {t("Back")}
        </button>
        <span className="eyebrow">{t("Step 3")}</span>
        <h2 className="title">{t("Choose a round")}</h2>
        <p className="muted">
          {comp.name} {t("ran")} {rounds.length}{" "}
          {rounds.length === 1 ? t("round of") : t("rounds of")}{" "}
          {event.display}.{" "}
          {t("Solve any of them. Later rounds rank you against the field that advanced.")}
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
              {i === 0 ? t("everyone") : t("advanced")} ›
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

/**
 * Celebration interstitial after qualifying. The next round's scrambles are
 * fetched in the background while this animates in, so "Start" is instant.
 */
function Qualified({
  roundName,
  ready,
  error,
  onStart,
  onBack,
  onRetry,
}: {
  roundName: string;
  ready: boolean;
  error: string | null;
  onStart: () => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  const { t } = useT();
  // stagger the entrance like the rest of the gate (60ms per element)
  const d = (i: number) => ({ animationDelay: `${i * 60}ms` });
  return (
    <div className="screen container container--gate qualified">
      <div className="qualified__mark gate__item" style={d(0)} aria-hidden="true">
        <Mark size={40} />
        <span className="qualified__ring" />
      </div>
      <span className="eyebrow gate__item qualified__eyebrow" style={d(1)}>
        {t("You made the cut")}
      </span>
      <h1 className="display qualified__title gate__item" style={d(2)}>
        {t("Congratulations!")}
      </h1>
      <p className="lead qualified__lead gate__item" style={d(3)}>
        {t("You qualified for the")} <strong>{roundName}</strong>.{" "}
        {t("Only the fastest advanced. Solve their scrambles and see if you'd hold your ground.")}
      </p>

      <div className="qualified__actions gate__item" style={d(4)}>
        {error ? (
          <>
            <p className="gate__error">{error}</p>
            <button className="btn btn--secondary" onClick={onRetry}>
              {t("Try again")}
            </button>
          </>
        ) : (
          <button className="btn qualified__cta" disabled={!ready} onClick={onStart}>
            {ready ? (
              <>
                {t("Start the")} {roundName} <span className="arrow">→</span>
              </>
            ) : (
              t("Loading scrambles…")
            )}
          </button>
        )}
        <button className="btn--ghost btn qualified__back" onClick={onBack}>
          {t("Back to results")}
        </button>
      </div>
    </div>
  );
}
