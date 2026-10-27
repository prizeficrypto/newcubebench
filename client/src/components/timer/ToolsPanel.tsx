import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../lib/i18n.tsx";
import { store } from "../../lib/store.ts";
import type { TimerSession } from "../../lib/timer/model.ts";
import { formatTime, type Precision } from "../../lib/timer/format.ts";
import { rollingSeries, solveValue } from "../../lib/timer/stats.ts";
import { wcaScramble } from "../../lib/scrambles.ts";
import { exportFileName } from "../../lib/timer/importExport.ts";
import { timerStore } from "../../lib/timer/storage.ts";

/**
 * The timer's tools panel (csTimer-style): one tool at a time, the last one
 * remembered. Everything here is optional — a tool that fails to load just
 * shows nothing; it never touches timing.
 */
export type ToolsPanelProps = {
  session: TimerSession;
  scramble: string;
  event: string;
  precision: Precision;
};

type Tool = "image" | "cross" | "trend" | "dist" | "daily" | "gen" | "metro";
const TOOL_KEY = "cb_timer_tool_v1";

export function ToolsPanel({ session, scramble, event, precision }: ToolsPanelProps) {
  const { t } = useT();
  const [tool, setTool] = useState<Tool>(() => (store.get(TOOL_KEY) as Tool) || "image");
  const choose = (next: Tool) => {
    setTool(next);
    store.set(TOOL_KEY, next);
  };
  const tools: { id: Tool; label: string }[] = [
    { id: "image", label: t("Scramble") },
    { id: "cross", label: t("Cross") },
    { id: "trend", label: t("Trend") },
    { id: "dist", label: t("Spread") },
    { id: "daily", label: t("Daily") },
    { id: "gen", label: t("Generator") },
    { id: "metro", label: t("Metronome") },
  ];

  return (
    <div className="card ttools">
      <div className="tseg ttools__tabs" role="tablist" aria-label={t("Tools")}>
        {tools.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tool === x.id}
            className={`tseg__btn${tool === x.id ? " is-on" : ""}`}
            onClick={() => choose(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="ttools__body">
        {tool === "image" && <ScrambleImage scramble={scramble} event={event} />}
        {tool === "cross" && <Cross scramble={scramble} event={event} />}
        {tool === "trend" && <Trend session={session} precision={precision} />}
        {tool === "dist" && <Distribution session={session} precision={precision} />}
        {tool === "daily" && <Daily session={session} />}
        {tool === "gen" && <Generator event={event} />}
        {tool === "metro" && <Metronome />}
      </div>
    </div>
  );
}

// ---------- scramble image (cubing.js 2D net) ----------

const TWISTY_PUZZLE: Record<string, string> = {
  "333": "3x3x3", "333oh": "3x3x3", "333bf": "3x3x3", "333fm": "3x3x3",
  "222": "2x2x2", "444": "4x4x4", "444bf": "4x4x4", "555": "5x5x5", "555bf": "5x5x5",
  "666": "6x6x6", "777": "7x7x7", pyram: "pyraminx", skewb: "skewb",
  minx: "megaminx", sq1: "square1", clock: "clock",
};

function ScrambleImage({ scramble, event }: { scramble: string; event: string }) {
  const { t } = useT();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<{ experimentalSetupAlg: string; puzzle: string } & HTMLElement>();
  const [failed, setFailed] = useState(false);
  const puzzle = TWISTY_PUZZLE[event];

  useEffect(() => {
    if (!puzzle || !scramble) return;
    let live = true;
    import("cubing/twisty")
      .then(({ TwistyPlayer }) => {
        if (!live || !host.current) return;
        if (!player.current) {
          const p = new TwistyPlayer({
            puzzle: puzzle as never,
            experimentalSetupAlg: scramble,
            alg: "",
            visualization: "2D",
            controlPanel: "none",
            background: "none",
            hintFacelets: "none",
          }) as unknown as typeof player.current;
          player.current = p;
          host.current.appendChild(p!);
        } else {
          player.current.puzzle = puzzle;
          player.current.experimentalSetupAlg = scramble;
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [scramble, puzzle]);

  if (!puzzle) return <p className="tertiary ttools__empty">{t("No image for this puzzle.")}</p>;
  if (failed) return <p className="tertiary ttools__empty">{t("The scramble image couldn't load.")}</p>;
  return <div ref={host} className="ttools__image" aria-label={t("Scrambled puzzle")} />;
}

// ---------- cross solver ----------

const CROSS_EVENTS = new Set(["333", "333oh", "333fm"]);

/** Optimal cross for every face; solutions are in the scramble's orientation. */
function Cross({ scramble, event }: { scramble: string; event: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<{ face: string; moves: string[] }[] | null | undefined>(undefined);
  useEffect(() => {
    if (!CROSS_EVENTS.has(event) || !scramble) return;
    let live = true;
    setRows(undefined);
    // The first run builds lookup tables (a few ms); keep it off the render.
    import("../../lib/timer/cross.ts").then(({ crossSolutions }) => {
      if (live) setRows(crossSolutions(scramble));
    });
    return () => {
      live = false;
    };
  }, [scramble, event]);

  if (!CROSS_EVENTS.has(event)) return <p className="tertiary ttools__empty">{t("The cross solver works on 3x3 scrambles.")}</p>;
  if (rows === null) return <p className="tertiary ttools__empty">{t("This scramble has moves the cross solver doesn't read.")}</p>;
  if (!rows) return <div className="spinner spinner--sm" />;
  return (
    <div className="tcross">
      <p className="tertiary tcross__note">{t("Fewest moves for each color's cross, holding the cube as scrambled.")}</p>
      {rows.map((r) => (
        <div key={r.face} className="tcross__row">
          <span className="tcross__face">{r.face}</span>
          <span className="mono tcross__moves">{r.moves.length ? r.moves.join(" ") : t("solved")}</span>
          <span className="mono tertiary">{r.moves.length}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- daily solve counts ----------

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Solves per day for the last 14 or 30 days, this session or all of them. */
function Daily({ session }: { session: TimerSession }) {
  const { t, lang } = useT();
  const [days, setDays] = useState(14);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    const sources = all ? timerStore.sessions() : [session];
    for (const s of sources) for (const x of s.solves) counts.set(dayKey(x.at), (counts.get(dayKey(x.at)) ?? 0) + 1);
    const out: { label: string; n: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      out.push({
        label: d.toLocaleDateString(lang, { month: "short", day: "numeric" }),
        n: counts.get(dayKey(d.getTime())) ?? 0,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.updatedAt, days, all, lang]);
  const top = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div className="tdaily">
      <div className="tgen__row">
        <div className="tseg">
          {[14, 30].map((d) => (
            <button key={d} className={`tseg__btn${days === d ? " is-on" : ""}`} onClick={() => setDays(d)}>
              {d} {t("days")}
            </button>
          ))}
        </div>
        <label className="tset__check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          {t("All sessions")}
        </label>
      </div>
      <div className="tdaily__bars" role="img" aria-label={`${total} ${t("solves")}`}>
        {rows.map((r, i) => (
          <div key={i} className="tdaily__col" title={`${r.label}: ${r.n}`}>
            <span className="mono tertiary tdaily__n">{r.n || ""}</span>
            <span className="tdaily__bar" style={{ height: `${(r.n / top) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="tdaily__axis tertiary">
        <span>{rows[0]?.label}</span>
        <span>{rows[rows.length - 1]?.label}</span>
      </div>
      <p className="tertiary tdaily__total">
        <span className="mono">{total}</span> {t("solves")}
      </p>
    </div>
  );
}

// ---------- time trend (inline SVG) ----------

function Trend({ session, precision }: { session: TimerSession; precision: Precision }) {
  const { t } = useT();
  const data = useMemo(() => {
    const values = session.solves.map((s) => solveValue(s, precision));
    return {
      values,
      ao5: rollingSeries(values, { kind: "ao", n: 5 }, 5, precision),
      ao12: rollingSeries(values, { kind: "ao", n: 12 }, 5, precision),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.updatedAt, session.id, precision]);
  const finite = data.values.filter(Number.isFinite);
  if (finite.length < 2) return <p className="tertiary ttools__empty">{t("A trend appears after a few solves.")}</p>;

  const W = 600, H = 200, PX = 44, PY = 12;
  const n = data.values.length;
  // Downsample long sessions to ~800 points so the SVG stays light.
  const stride = Math.max(1, Math.ceil(n / 800));
  const sorted = [...finite].sort((a, b) => a - b);
  // Clip the slowest 2% so one disaster doesn't flatten the chart.
  const max = sorted[Math.floor((sorted.length - 1) * 0.98)];
  const min = sorted[0];
  const range = max - min || 1;
  const x = (i: number) => PX + (i / Math.max(1, n - 1)) * (W - PX - 8);
  const y = (v: number) => PY + (1 - (Math.min(v, max) - min) / range) * (H - 2 * PY);
  const line = (series: (number | undefined)[]) => {
    let d = "";
    for (let i = 0; i < n; i += stride) {
      const v = series[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    }
    return d;
  };
  const ticks = [min, min + range / 3, min + (2 * range) / 3, max];

  return (
    <div className="ttrend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Your times over this session")}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PX} x2={W - 8} y1={y(v)} y2={y(v)} className="ttrend__grid" />
            <text x={PX - 6} y={y(v) + 4} className="ttrend__tick">
              {formatTime(v, 2).replace(/\.\d+$/, "")}
            </text>
          </g>
        ))}
        {data.values.map((v, i) =>
          i % stride === 0 && Number.isFinite(v) ? (
            <circle key={i} cx={x(i)} cy={y(v)} r={1.8} className="ttrend__dot" />
          ) : null,
        )}
        <path d={line(data.ao12)} className="ttrend__ao12" />
        <path d={line(data.ao5)} className="ttrend__ao5" />
      </svg>
      <div className="ttrend__legend tertiary">
        <span><i className="ttrend__key ttrend__key--dot" />{t("Singles")}</span>
        <span><i className="ttrend__key ttrend__key--ao5" />ao5</span>
        <span><i className="ttrend__key ttrend__key--ao12" />ao12</span>
      </div>
    </div>
  );
}

// ---------- distribution ----------

function Distribution({ session, precision }: { session: TimerSession; precision: Precision }) {
  const { t } = useT();
  const finite = useMemo(
    () => session.solves.map((s) => solveValue(s, precision)).filter(Number.isFinite),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.updatedAt, session.id, precision],
  );
  if (finite.length < 3) return <p className="tertiary ttools__empty">{t("The spread appears after a few solves.")}</p>;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const spread = hi - lo;
  // Bin width: the smallest "nice" step giving at most ~12 rows.
  const steps = [250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
  const width = steps.find((s) => spread / s <= 12) ?? 60000;
  const start = Math.floor(lo / width) * width;
  const bins = new Map<number, number>();
  for (const v of finite) {
    const b = start + Math.floor((v - start) / width) * width;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const rows = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  const top = Math.max(...rows.map((r) => r[1]));
  return (
    <div className="tdist">
      {rows.map(([b, c]) => (
        <div key={b} className="tdist__row">
          <span className="mono tdist__label">{formatTime(b, 2).replace(/0+$/, "").replace(/\.$/, "")}+</span>
          <span className="tdist__track">
            <span className="tdist__bar" style={{ width: `${(c / top) * 100}%` }} />
          </span>
          <span className="mono tertiary tdist__count">{c}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- scramble generator ----------

function Generator({ event }: { event: string }) {
  const { t } = useT();
  const [count, setCount] = useState(5);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(0);
  const run = async () => {
    const n = Math.max(1, Math.min(999, count));
    const lines: string[] = [];
    for (let i = 0; i < n; i++) {
      setBusy(i + 1);
      lines.push(`${i + 1}. ${await wcaScramble(event)}`);
    }
    setBusy(0);
    setOut(lines.join("\n"));
  };
  if (event === "none") return <p className="tertiary ttools__empty">{t("Pick a puzzle to generate scrambles.")}</p>;
  return (
    <div className="tgen">
      <div className="tgen__row">
        <input
          type="number"
          className="input tgen__count mono"
          min={1}
          max={999}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label={t("How many")}
        />
        <button className="btn btn--secondary" disabled={busy > 0} onClick={() => void run()}>
          {busy ? `${busy}/${count}` : t("Generate")}
        </button>
      </div>
      {out && (
        <>
          <textarea className="input tgen__out mono" readOnly rows={6} value={out} />
          <div className="tgen__row">
            <button className="btn btn--ghost" onClick={() => void navigator.clipboard?.writeText(out)}>
              {t("Copy")}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([out], { type: "text/plain" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = exportFileName("txt").replace("cubebench_", "scrambles_");
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {t("Download")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- metronome ----------

function Metronome() {
  const { t } = useT();
  const [bpm, setBpm] = useState(60);
  const [volume, setVolume] = useState(30);
  const [on, setOn] = useState(false);
  const ctx = useRef<AudioContext>();
  useEffect(() => {
    if (!on) return;
    ctx.current ??= new AudioContext();
    const ac = ctx.current;
    void ac.resume();
    const tick = () => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = 440;
      gain.gain.value = volume / 100;
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.1);
    };
    tick();
    const id = setInterval(tick, 60_000 / bpm);
    return () => clearInterval(id);
  }, [on, bpm, volume]);
  useEffect(() => () => void ctx.current?.close(), []);
  return (
    <div className="tgen">
      <label className="tset__row">
        <span className="tset__label">{t("Beats per minute")}</span>
        <span className="mono">{bpm}</span>
      </label>
      <input type="range" min={10} max={360} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label={t("Beats per minute")} />
      <label className="tset__row">
        <span className="tset__label">{t("Volume")}</span>
        <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label={t("Volume")} />
      </label>
      <button className="btn btn--secondary" onClick={() => setOn((v) => !v)}>
        {on ? t("Stop") : t("Start")}
      </button>
    </div>
  );
}
