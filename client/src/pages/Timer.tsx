import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../lib/i18n.tsx";
import { AdSlot } from "../components/AdSlot.tsx";
import { useTimerEngine } from "../components/timer/useTimerEngine.ts";
import { PenaltyChips, StatsPanel } from "../components/timer/StatsPanel.tsx";
import {
  HelpDialog,
  NewSessionDialog,
  SessionsDialog,
  SettingsDialog,
} from "../components/timer/TimerDialogs.tsx";
import { isTouchDevice } from "../lib/pointer.ts";
import { formatSolve, formatTime } from "../lib/timer/format.ts";
import { newId, effectiveMs, type Penalty, type SolveSource } from "../lib/timer/model.ts";
import { TIMER_EVENTS } from "../lib/timer/puzzles.ts";
import { settingsIndicators, useTimerSettings } from "../lib/timer/settings.ts";
import { sessionStats } from "../lib/timer/stats.ts";
import { timerStore, useTimerStore } from "../lib/timer/storage.ts";
import { shortcutFor, keysBelongElsewhere } from "../lib/timer/shortcuts.ts";
import { parseTypedTimes, TYPED_REJECT_TEXT } from "../lib/timer/typing.ts";
import { zeroText, phaseDurations } from "../lib/timer/display.ts";
import { announce } from "../lib/timer/voice.ts";
import {
  connectGanTimer,
  connectStackmat,
  type HardwareConnection,
  type HardwareStatus,
} from "../lib/timer/hardware.ts";
import { prefetchScrambles, takeScramble, warmScrambler, type Scramble } from "../lib/scrambles.ts";
import type { EngineResult } from "../lib/timer/engine.ts";
import "../styles/timer.css";

// Heavy, optional panels load on demand so the timer itself paints first.
const ToolsPanel = lazy(() =>
  import("../components/timer/ToolsPanel.tsx").then((m) => ({ default: m.ToolsPanel })),
);
const ImportExportDialog = lazy(() =>
  import("../components/timer/ImportExportDialog.tsx").then((m) => ({
    default: m.ImportExportDialog,
  })),
);

/**
 * The practice timer — the first thing anyone sees. csTimer-class: sessions,
 * WCA inspection with spoken calls, keyboard/touch, typed times, StackMat and
 * Bluetooth timers, full statistics, import/export and tools. All solves go
 * through timerStore (IndexedDB), so they persist and can sync to an account.
 */
export default function Timer() {
  const { t, lang } = useT();
  const [settings] = useTimerSettings();
  const { sessions, active } = useTimerStore();
  const event = active?.event ?? "333";
  const precision = settings.precision;
  const [dialog, setDialog] = useState<"settings" | "sessions" | "io" | "new" | "help" | null>(null);
  const [touch] = useState(isTouchDevice);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }, []);

  // ---------- scrambles: history (prev/next), custom queue, generation ----------
  const [scr, setScr] = useState<{ list: Scramble[]; pos: number }>({ list: [], pos: -1 });
  const custom = useRef<string[]>([]);
  const gen = useRef(0);
  const scramble = scr.pos >= 0 ? scr.list[scr.pos] : undefined;
  const pos = scr.pos;
  const push = (s: Scramble) => setScr((h) => ({ list: [...h.list, s], pos: h.list.length }));

  const nextScramble = useCallback((ev: string) => {
    const id = ++gen.current;
    if (custom.current.length) {
      push({ text: custom.current.shift()!, source: "manual" });
      return;
    }
    void takeScramble(ev).then((s) => {
      // A newer request (another solve, an event switch) supersedes this one.
      if (id === gen.current) push(s);
    });
  }, []);

  // A different event (switching session or puzzle) starts a fresh history.
  useEffect(() => {
    if (!active) return;
    warmScrambler();
    prefetchScrambles(event);
    custom.current = [];
    setScr({ list: [], pos: -1 });
    nextScramble(event);
  }, [event, active?.id, nextScramble]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepScramble = (dir: -1 | 1) => {
    if (dir === -1) setScr((h) => ({ ...h, pos: Math.max(0, h.pos - 1) }));
    else if (scr.pos < scr.list.length - 1) setScr((h) => ({ ...h, pos: h.pos + 1 }));
    else nextScramble(event);
  };

  // ---------- recording ----------
  const record = useCallback(
    (ms: number, penalty: Penalty, src: SolveSource, extra: { splits?: number[]; scramble?: string; at?: number; comment?: string } = {}) => {
      const s = timerStore.active();
      if (!s || ms <= 0) return;
      timerStore.addSolve(s.id, {
        id: newId(),
        ms: Math.round(ms),
        penalty,
        scramble: extra.scramble ?? scramble?.text ?? "",
        at: extra.at ?? Date.now(),
        ...(extra.comment ? { comment: extra.comment } : {}),
        ...(extra.splits && extra.splits.length > 1 ? { splits: extra.splits } : {}),
        src,
      });
    },
    [scramble],
  );

  const input = settings.input;
  const external = input === "stackmat" || input === "bluetooth";
  const onResult = useCallback(
    (r: EngineResult) => {
      record(r.ms, r.penalty, input === "stackmat" ? "stackmat" : input === "bluetooth" ? "bluetooth" : "timer", { splits: r.splits });
      nextScramble(event);
    },
    [record, nextScramble, event, input],
  );

  const engine = useTimerEngine({
    config: {
      holdMs: settings.holdMs,
      inspection: settings.inspection,
      phases: settings.phases,
      stopKey: settings.stopKey,
      external,
    },
    update: settings.update,
    precision,
    keyboard: input !== "typing" && dialog === null,
    onResult,
    onCall: (mark) =>
      announce(mark === 8000 ? t("Eight seconds") : t("Twelve seconds"), {
        mode: settings.alerts,
        voiceName: settings.voiceName,
        volume: settings.volume,
        lang,
      }),
  });
  const { state, dispatch } = engine;
  const stateRef = useRef(state.phase);
  stateRef.current = state.phase;

  // ---------- hardware timers: the connection outlives renders and scrambles ----------
  const hw = useRef<HardwareConnection | null>(null);
  const [hwStatus, setHwStatus] = useState<HardwareStatus | "off">("off");
  useEffect(() => {
    // Leaving a hardware input (or this page) disconnects it.
    return () => {
      hw.current?.close();
      hw.current = null;
      setHwStatus("off");
    };
  }, [input]);
  const connectHardware = async () => {
    hw.current?.close();
    const handlers = {
      onHold: (hold: "none" | "holding" | "ready") => dispatch({ type: "extHold", hold }),
      onStart: () => dispatch({ type: "extStart", t: performance.now() }),
      onStop: (ms: number) => dispatch({ type: "extStop", t: performance.now(), ms }),
      onStatus: setHwStatus,
    };
    hw.current = input === "stackmat" ? await connectStackmat(handlers) : await connectGanTimer(handlers);
  };

  // ---------- typing ----------
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState("");
  const submitTyped = () => {
    if (!typed.trim()) {
      stepScramble(1); // Enter on an empty box: next scramble
      return;
    }
    const { entries, rejected } = parseTypedTimes(typed);
    if (entries.length === 0) {
      const r = rejected[0];
      setTypedError(`"${r?.input ?? typed.trim()}": ${t(TYPED_REJECT_TEXT[r?.reason ?? "unreadable"])}`);
      return;
    }
    entries.forEach((e, i) =>
      record(e.ms, e.penalty, "typed", {
        scramble: e.scramble ?? (i === 0 ? scramble?.text : ""),
        at: e.at,
        comment: e.comment,
        splits: e.splits,
      }),
    );
    setTyped("");
    setTypedError(rejected.length ? `${rejected.length} ${t("entries couldn't be read and were skipped.")}` : "");
    nextScramble(event);
  };

  // ---------- statistics (memoized on the session's last change) ----------
  const indicators = useMemo(() => settingsIndicators(settings), [settings]);
  const stats = useMemo(
    () =>
      sessionStats(active?.solves ?? [], { indicators, trimPct: settings.trimPct, precision }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active?.id, active?.updatedAt, indicators, settings.trimPct, precision],
  );

  // A quiet note when a solve sets a new session best.
  const lastCount = useRef<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const prev = lastCount.current;
    lastCount.current = { id: active.id, n: stats.count };
    if (!prev || prev.id !== active.id || stats.count !== prev.n + 1 || stats.count < 2) return;
    const last = stats.count - 1;
    const bests = stats.indicators.filter(
      (i) => i.bestEnd === last && i.series.filter((v) => v !== undefined).length > 1 && Number.isFinite(i.best),
    );
    if (bests.length) say(`${t("New best")} ${bests.map((b) => b.key).join(", ")}`);
    else if (stats.bestIndex === last) say(t("New best single"));
  }, [stats, active, say, t]);

  // ---------- shortcuts (csTimer's) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stateRef.current !== "idle" && stateRef.current !== "stopped") return;
      if (keysBelongElsewhere(e.target, document)) return;
      const sc = shortcutFor(e);
      if (!sc) return;
      e.preventDefault();
      const s = timerStore.active();
      const latest = s?.solves[s.solves.length - 1];
      switch (sc.kind) {
        case "penalty":
          if (s && latest) timerStore.updateSolve(s.id, latest.id, { penalty: sc.penalty });
          break;
        case "deleteLast":
          if (s && latest && window.confirm(t("Delete the latest solve?"))) {
            timerStore.deleteSolve(s.id, latest.id);
            dispatch({ type: "reset" });
          }
          break;
        case "scramble":
          stepScramble(sc.dir);
          break;
        case "session": {
          const list = timerStore.sessions();
          const i = list.findIndex((x) => x.id === s?.id);
          const next = list[i + sc.dir];
          if (next) timerStore.setActive(next.id);
          break;
        }
        case "event":
          if (s) timerStore.update(s.id, (x) => ({ ...x, event: sc.event }));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- render ----------
  const latest = active?.solves[active.solves.length - 1];
  const prevSolve = active?.solves[active.solves.length - 2];
  // The finished time stays up until the next hold begins.
  const showResult = state.phase === "stopped" && state.hold === "none" && latest;
  const animating = state.phase === "running" || state.phase === "inspecting";
  const holdCls =
    state.hold === "ready" ? " is-armed" : state.hold === "holding" ? " is-holding" : "";
  const diff =
    settings.diffLabel && showResult && latest && prevSolve
      ? (() => {
          const a = effectiveMs(latest);
          const b = effectiveMs(prevSolve);
          return a === null || b === null ? null : a - b;
        })()
      : null;
  const ao = (key: string) => stats.indicators.find((i) => i.key === key);

  return (
    <div className={`screen container--wide ttimer${settings.zen ? " ttimer--zen" : ""}`}>
      <div className="ttimer__bar tz-hide">
        <div className="ttimer__pickers">
        <select
          className="pill-select ttimer__session"
          value={active?.id ?? ""}
          onChange={(e) => timerStore.setActive(e.target.value)}
          aria-label={t("Session")}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.solves.length}
            </option>
          ))}
        </select>
        <button
          className="pill ttimer__new"
          onClick={() => setDialog("new")}
          aria-label={t("New session")}
          title={t("New session")}
        >
          <span aria-hidden="true">+</span>
          <span className="ttimer__new-label">{t("New")}</span>
        </button>
        <select
          className="pill-select ttimer__event"
          value={event}
          onChange={(e) => active && timerStore.update(active.id, (x) => ({ ...x, event: e.target.value }))}
          aria-label={t("Puzzle")}
        >
          {TIMER_EVENTS.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {t(ev.name)}
            </option>
          ))}
        </select>
        </div>
        <div className="ttimer__actions">
          <button className="pill pill--plain" onClick={() => setDialog("sessions")}>
            {t("Sessions")}
          </button>
          <button className="pill pill--plain" onClick={() => setDialog("io")}>
            {t("Import / Export")}
          </button>
          <button className="pill pill--plain" onClick={() => setDialog("settings")}>
            {t("Settings")}
          </button>
          <button className="pill pill--plain" onClick={() => setDialog("help")}>
            {t("Help")}
          </button>
        </div>
      </div>

      <div className="ttimer__layout">
        <div className="ttimer__main">
          <div className="tscramble tz-hide">
            {event === "none" ? (
              <p className="tertiary">{t("No scramble. Just time your solves.")}</p>
            ) : scramble ? (
              <button
                className={`tscramble__text mono${scramble.text.length > 120 ? " is-long" : ""}`}
                title={t("Copy scramble")}
                onClick={() => {
                  void navigator.clipboard?.writeText(scramble.text);
                  say(t("Scramble copied"));
                }}
              >
                {scramble.text}
              </button>
            ) : (
              <span className="tscramble__loading tertiary">{t("Generating a scramble…")}</span>
            )}
            <div className="tscramble__nav">
              <button className="pill pill--plain pill--sm" disabled={pos <= 0} onClick={() => stepScramble(-1)}>
                {t("Previous")}
              </button>
              <button
                className="pill pill--plain pill--sm"
                onClick={() => {
                  const text = window.prompt(t("Paste your own scramble(s), one per line:"));
                  if (!text) return;
                  const lines = text
                    .split(/\r?\n/)
                    .map((l) => l.replace(/^\s*\d+\s*[.)]\s*/, "").trim())
                    .filter(Boolean);
                  if (!lines.length) return;
                  custom.current = lines;
                  nextScramble(event);
                }}
              >
                {t("Use my own")}
              </button>
              <button className="pill pill--plain pill--sm" onClick={() => stepScramble(1)}>
                {t("Next")}
              </button>
            </div>
            {scramble?.source === "random" && (
              <p className="tertiary tscramble__note">{t("Quick random-move scramble while the official scrambler loads.")}</p>
            )}
          </div>

          {input === "typing" ? (
            <form
              className="ttyping"
              onSubmit={(e) => {
                e.preventDefault();
                submitTyped();
              }}
            >
              <input
                className="input ttyping__input mono"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setTypedError("");
                }}
                placeholder="12.34"
                inputMode="decimal"
                autoComplete="off"
                aria-label={t("Type a time")}
                autoFocus
              />
              <p className="tertiary ttyping__hint">
                {typedError || t("Enter a time like 12.34, 1234, 1:02.50, 14.00+ or DNF(12.34). Separate several with commas.")}
              </p>
            </form>
          ) : (
            <div
              className={`tzone${animating ? " is-active" : ""}`}
              {...engine.zoneHandlers}
              role="button"
              tabIndex={-1}
              aria-label={t("Timer")}
            >
              {animating ? (
                <div
                  ref={engine.liveRef}
                  className={`tzone__time mono${state.phase === "inspecting" ? " is-inspecting" : " is-running"}${holdCls}`}
                  aria-live="off"
                />
              ) : (
                <div className={`tzone__time mono${holdCls}`}>
                  {showResult ? formatSolve(latest, precision) : zeroText(precision)}
                </div>
              )}
              {state.phase === "running" && settings.update === "hidden" && (
                <div className="tzone__word">{t("Solving")}</div>
              )}
              {diff !== null && (
                <div className={`tzone__diff mono ${diff < 0 ? "is-faster" : "is-slower"}`}>
                  {diff < 0 ? "−" : "+"}
                  {formatTime(Math.abs(diff), precision)}
                </div>
              )}
              <div className="tzone__hint tz-hide" role="status">
                {hint(t, state.phase, state.hold, settings.inspection, external, hwStatus, touch)}
              </div>
              {!animating && (
                <div className="tzone__avgs tz-hide">
                  {["ao5", "ao12"].map((k) => {
                    const ind = ao(k);
                    return ind ? (
                      <span key={k} className="tzone__avg">
                        <span className="tzone__avg-label">{k}</span>
                        <span className="mono">
                          {ind.current === undefined ? "–" : Number.isFinite(ind.current) ? formatTime(ind.current, precision) : "DNF"}
                        </span>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {external && hwStatus !== "connected" && (
            <div className="thw tz-hide">
              <p className="muted">{hardwareHelp(t, input, hwStatus)}</p>
              <button className="btn" onClick={() => void connectHardware()} disabled={hwStatus === "connecting"}>
                {hwStatus === "connecting"
                  ? t("Connecting…")
                  : input === "stackmat"
                    ? t("Connect Stackmat")
                    : t("Connect Bluetooth timer")}
              </button>
            </div>
          )}

          {showResult && latest && active && (
            <div className="tpost tz-hide">
              <PenaltyChips
                penalty={latest.penalty}
                onChange={(penalty) => timerStore.updateSolve(active.id, latest.id, { penalty })}
              />
              {latest.splits && latest.splits.length > 1 && (
                <span className="tertiary mono">
                  {phaseDurations(latest.splits).map((p) => formatTime(p, precision)).join(" + ")}
                </span>
              )}
              <div className="tpost__more">
                <button
                  className="pill pill--plain pill--sm"
                  onClick={() => {
                    const c = window.prompt(t("Comment"), latest.comment ?? "");
                    if (c !== null) timerStore.updateSolve(active.id, latest.id, { comment: c.trim() || undefined });
                  }}
                >
                  {latest.comment ? t("Edit comment") : t("Add comment")}
                </button>
                <button
                  className="pill pill--plain pill--sm pill--danger"
                  onClick={() => {
                    timerStore.deleteSolve(active.id, latest.id);
                    dispatch({ type: "reset" });
                  }}
                >
                  {t("Delete")}
                </button>
              </div>
            </div>
          )}
          {toast && (
            <div className="ttoast" role="status">
              {toast}
            </div>
          )}
        </div>

        <aside className="ttimer__side tz-hide">
          {active ? (
            <>
              <StatsPanel session={active} stats={stats} precision={precision} trimPct={settings.trimPct} />
              <Suspense fallback={<div className="card ttools-loading" />}>
                <ToolsPanel session={active} scramble={scramble?.text ?? ""} event={event} precision={precision} />
              </Suspense>
            </>
          ) : (
            <div className="card tstats ttools-loading" />
          )}
          <p className="tertiary ttimer__sim">
            <Link to="/app/competitions">{t("Ready for real scrambles? Simulate a WCA competition round.")}</Link>
          </p>
        </aside>
      </div>

      <div className="ttimer__ad">
        <AdSlot placement="timer" />
      </div>

      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === "sessions" && <SessionsDialog onClose={() => setDialog(null)} />}
      {dialog === "new" && <NewSessionDialog defaultEvent={event} onClose={() => setDialog(null)} />}
      {dialog === "help" && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === "io" && (
        <Suspense fallback={null}>
          <ImportExportDialog open onClose={() => setDialog(null)} />
        </Suspense>
      )}
    </div>
  );
}

function hint(
  t: (k: string) => string,
  phase: string,
  hold: string,
  inspection: boolean,
  external: boolean,
  hw: HardwareStatus | "off",
  touch: boolean,
): string {
  if (phase === "running") return external ? "" : touch ? t("Tap anywhere to stop") : t("Any key or tap to stop");
  if (hold === "ready") return external ? t("Ready, lift your hands to start") : t("Release to start");
  if (hold === "holding") return t("Keep holding");
  if (phase === "inspecting") return external ? t("Inspecting. Start the timer when ready.") : t("Inspecting. Hold, then release to start.");
  if (external) {
    if (hw !== "connected") return "";
    return inspection ? t("Press space or tap here to start inspection.") : t("Hands on the timer when you're ready.");
  }
  if (inspection) return touch ? t("Tap to start inspection.") : t("Press space or tap to start inspection.");
  return touch ? t("Touch and hold, let go to start.") : t("Hold space or the screen, release to start.");
}

function hardwareHelp(t: (k: string) => string, input: string, s: HardwareStatus | "off"): string {
  if (s === "denied") {
    return input === "stackmat"
      ? t("Microphone access is needed to read the Stackmat. Allow it in your browser, then try again.")
      : t("Bluetooth access was blocked. Allow it in your browser, then try again.");
  }
  if (s === "unsupported") return t("Bluetooth timers need Chrome or Edge on a computer or Android.");
  if (s === "lost") return t("The timer disconnected. Connect it again to keep going.");
  if (s === "error") {
    return input === "stackmat"
      ? t("Couldn't start listening. Check that your Stackmat cable is in the mic/line-in jack, then try again.")
      : t("Couldn't connect. Turn the timer on, keep it close, and try again.");
  }
  return input === "stackmat"
    ? t("Plug your Stackmat into the mic/line-in jack with the audio cable, then connect. We read its signal through the microphone.")
    : t("Turn on your GAN Smart Timer, then connect and pick it from the list. (Beta)");
}
