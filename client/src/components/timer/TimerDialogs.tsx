import { useState } from "react";
import { useT } from "../../lib/i18n.tsx";
import { formatStat } from "../../lib/timer/format.ts";
import { eventName, TIMER_EVENTS } from "../../lib/timer/puzzles.ts";
import {
  HOLD_OPTIONS,
  INDICATOR_OPTIONS,
  PHASE_OPTIONS,
  TRIM_OPTIONS,
  useTimerSettings,
  type AlertMode,
  type InputMethod,
} from "../../lib/timer/settings.ts";
import { sessionStats } from "../../lib/timer/stats.ts";
import { timerStore } from "../../lib/timer/storage.ts";
import { bluetoothSupported } from "../../lib/timer/hardware.ts";
import { announce, useVoices } from "../../lib/timer/voice.ts";
import type { UpdateMode } from "../../lib/timer/display.ts";
import { Modal } from "./StatsPanel.tsx";

/** A small segmented control: one choice out of a few. */
function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tset__row">
      <span className="tset__label">{label}</span>
      <div className="tseg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            className={`tseg__btn${value === o.value ? " is-on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="tset__row tset__toggle">
      <span className="tset__label">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const [s, set] = useTimerSettings();
  const voices = useVoices(lang);
  const bt = bluetoothSupported();

  return (
    <Modal title={t("Timer settings")} onClose={onClose} wide>
      <div className="tset">
        <h3 className="tset__group">{t("Input")}</h3>
        <Seg<InputMethod>
          label={t("Add solves with")}
          value={s.input}
          onChange={(input) => set({ input })}
          options={[
            { value: "timer", label: t("Timer") },
            { value: "typing", label: t("Typing") },
            { value: "stackmat", label: "Stackmat" },
            { value: "bluetooth", label: t("Bluetooth timer"), disabled: !bt },
          ]}
        />
        {!bt && (
          <p className="tertiary tset__note">
            {t("Bluetooth timers need Chrome or Edge on a computer or Android.")}
          </p>
        )}
        <Seg
          label={t("Hold to start")}
          value={s.holdMs}
          onChange={(holdMs) => set({ holdMs })}
          options={HOLD_OPTIONS.map((ms) => ({ value: ms, label: ms === 0 ? t("Off") : `${ms / 1000}s` }))}
        />
        <Seg<"any" | "space">
          label={t("Stop with")}
          value={s.stopKey}
          onChange={(stopKey) => set({ stopKey })}
          options={[
            { value: "any", label: t("Any key") },
            { value: "space", label: t("Space only") },
          ]}
        />
        <Seg
          label={t("Phases per solve")}
          value={s.phases}
          onChange={(phases) => set({ phases })}
          options={PHASE_OPTIONS.map((p) => ({ value: p, label: String(p) }))}
        />

        <h3 className="tset__group">{t("Inspection")}</h3>
        <Toggle label={t("WCA inspection (15 seconds)")} checked={s.inspection} onChange={(inspection) => set({ inspection })} />
        <Seg<AlertMode>
          label={t("8 and 12 second calls")}
          value={s.alerts}
          onChange={(alerts) => set({ alerts })}
          options={[
            { value: "off", label: t("Off") },
            { value: "female", label: t("Female voice") },
            { value: "male", label: t("Male voice") },
            { value: "beep", label: t("Beep") },
          ]}
        />
        {(s.alerts === "male" || s.alerts === "female") && (
          <div className="tset__row">
            <span className="tset__label">{t("Voice")}</span>
            <select
              className="input tset__select"
              value={s.voiceName}
              onChange={(e) => set({ voiceName: e.target.value })}
            >
              <option value="">{t("Automatic")}</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {s.alerts !== "off" && (
          <div className="tset__row">
            <span className="tset__label">{t("Volume")}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={s.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
              aria-label={t("Volume")}
            />
            <button
              className="btn btn--secondary tset__test"
              onClick={() =>
                announce(t("Eight seconds"), {
                  mode: s.alerts,
                  voiceName: s.voiceName,
                  volume: s.volume,
                  lang,
                })
              }
            >
              {t("Test")}
            </button>
          </div>
        )}

        <h3 className="tset__group">{t("Display")}</h3>
        <Seg<UpdateMode>
          label={t("While timing, show")}
          value={s.update}
          onChange={(update) => set({ update })}
          options={[
            { value: "realtime", label: t("Full time") },
            { value: "tenths", label: "0.1s" },
            { value: "seconds", label: t("Seconds") },
            { value: "hidden", label: t("Nothing") },
          ]}
        />
        <Seg
          label={t("Precision")}
          value={s.precision}
          onChange={(precision) => set({ precision })}
          options={[
            { value: 2, label: "0.01" },
            { value: 3, label: "0.001" },
          ]}
        />
        <Toggle label={t("Focus mode: hide everything while timing")} checked={s.zen} onChange={(zen) => set({ zen })} />
        <Toggle label={t("Show the difference from your last solve")} checked={s.diffLabel} onChange={(diffLabel) => set({ diffLabel })} />

        <h3 className="tset__group">{t("Statistics")}</h3>
        <div className="tset__row">
          <span className="tset__label">{t("Averages shown")}</span>
          <div className="tset__checks">
            {INDICATOR_OPTIONS.map((k) => (
              <label key={k} className="tset__check">
                <input
                  type="checkbox"
                  checked={s.indicators.includes(k)}
                  onChange={(e) =>
                    set({
                      indicators: e.target.checked
                        ? [...s.indicators, k]
                        : s.indicators.filter((x) => x !== k),
                    })
                  }
                />
                <span className="mono">{k}</span>
              </label>
            ))}
          </div>
        </div>
        <Seg
          label={t("Trimmed from each end")}
          value={s.trimPct}
          onChange={(trimPct) => set({ trimPct })}
          options={TRIM_OPTIONS.map((p) => ({ value: p, label: `${p}%` }))}
        />
      </div>
    </Modal>
  );
}

/** Rename, reorder, merge and delete sessions. */
export function SessionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const sessions = timerStore.sessions();
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  const move = (i: number, dir: -1 | 1) => {
    const a = sessions[i];
    const b = sessions[i + dir];
    if (!a || !b) return;
    timerStore.update(a.id, (s) => ({ ...s, order: b.order }));
    timerStore.update(b.id, (s) => ({ ...s, order: a.order }));
    refresh();
  };

  return (
    <Modal title={t("Sessions")} onClose={onClose} wide>
      <ul className="tsess">
        {sessions.map((s, i) => {
          const st = sessionStats(s.solves, { indicators: [] });
          return (
            <li key={s.id} className="tsess__row">
              <input
                className="input tsess__name"
                defaultValue={s.name}
                aria-label={t("Session name")}
                maxLength={40}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== s.name) timerStore.update(s.id, (x) => ({ ...x, name }));
                }}
              />
              <select
                className="input tsess__event"
                value={s.event}
                aria-label={t("Puzzle")}
                onChange={(e) => {
                  timerStore.update(s.id, (x) => ({ ...x, event: e.target.value }));
                  refresh();
                }}
              >
                {TIMER_EVENTS.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {t(ev.name)}
                  </option>
                ))}
              </select>
              <span className="tertiary mono tsess__meta">
                {st.count} · {formatStat(st.mean)}
              </span>
              <div className="tsess__actions">
                <button className="btn btn--ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("Move up")}>
                  ↑
                </button>
                <button className="btn btn--ghost" disabled={i === sessions.length - 1} onClick={() => move(i, 1)} aria-label={t("Move down")}>
                  ↓
                </button>
                {sessions.length > 1 && (
                  <select
                    className="input tsess__merge"
                    value=""
                    aria-label={t("Merge into")}
                    onChange={(e) => {
                      const target = timerStore.get(e.target.value);
                      if (!target) return;
                      if (!window.confirm(t("Move all solves into the other session and delete this one?"))) return;
                      const merged = [...target.solves, ...s.solves].sort((x, y) => x.at - y.at);
                      timerStore.update(target.id, (x) => ({ ...x, solves: merged }));
                      timerStore.remove(s.id);
                      refresh();
                    }}
                  >
                    <option value="">{t("Merge into…")}</option>
                    {sessions
                      .filter((o) => o.id !== s.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                )}
                <button
                  className="btn btn--ghost tsess__delete"
                  onClick={() => {
                    if (window.confirm(t("Delete this session and its solves?"))) {
                      timerStore.remove(s.id);
                      refresh();
                    }
                  }}
                >
                  {t("Delete")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        className="btn btn--secondary"
        onClick={() => {
          const ev = timerStore.active()?.event ?? "333";
          timerStore.create(t(eventName(ev)), ev);
          refresh();
        }}
      >
        {t("New session")}
      </button>
    </Modal>
  );
}
