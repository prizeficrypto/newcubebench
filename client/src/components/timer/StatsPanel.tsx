import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "../../lib/i18n.tsx";
import { formatSolve, formatStat, formatTime, type Precision } from "../../lib/timer/format.ts";
import type { Penalty, TimerSession, TimerSolve } from "../../lib/timer/model.ts";
import { phaseDurations } from "../../lib/timer/display.ts";
import {
  rollingSeries,
  solveValue,
  trimCount,
  type SessionStats,
} from "../../lib/timer/stats.ts";
import { timerStore } from "../../lib/timer/storage.ts";

/**
 * The session's numbers: the stats table (count, mean, best/worst, σ, and
 * current/best for each indicator), the time list with rolling ao5/ao12, and
 * the per-solve dialog. Everything derives from `stats`, which the page
 * memoizes on the session's updatedAt.
 */
export function StatsPanel({
  session,
  stats,
  precision,
  trimPct,
}: {
  session: TimerSession;
  stats: SessionStats;
  precision: Precision;
  trimPct: number;
}) {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  const [report, setReport] = useState<{ key: string; end: number } | null>(null);
  const [shown, setShown] = useState(50);
  useEffect(() => setShown(50), [session.id]);

  const values = useMemo(
    () => session.solves.map((s) => solveValue(s, precision)),
    [session.solves, precision],
  );
  // The list's rolling columns are always ao5 and ao12 (csTimer's default).
  const ao5 = useMemo(() => rollingSeries(values, { kind: "ao", n: 5 }, trimPct, precision), [values, trimPct, precision]);
  const ao12 = useMemo(() => rollingSeries(values, { kind: "ao", n: 12 }, trimPct, precision), [values, trimPct, precision]);

  const n = session.solves.length;
  const rows: number[] = [];
  for (let i = n - 1; i >= Math.max(0, n - shown); i--) rows.push(i);

  return (
    <div className="card tstats">
      <div className="tstats__grid">
        <Stat label={t("Solves")} hint={t("Finished solves / all solves (DNFs included)")} value={`${stats.nonDnf}/${stats.count}`} />
        <Stat label={t("Mean")} hint={t("Average of every solve in this session, DNFs left out")} value={formatStat(stats.mean, precision)} />
        <Stat label={t("Best")} hint={t("Your fastest single in this session")} value={formatStat(stats.best, precision)} />
        <Stat label={t("Worst")} hint={t("Your slowest finished single in this session")} value={formatStat(stats.worst, precision)} />
        <Stat label="σ" raw hint={t("Consistency: how far your times spread. Lower is steadier.")} value={stats.sd === undefined ? "–" : formatTime(stats.sd, precision)} />
      </div>

      <table className="tstats__table">
        <thead>
          <tr>
            <th />
            <th>{t("Current")}</th>
            <th>{t("Best")}</th>
          </tr>
        </thead>
        <tbody>
          {stats.indicators.map((ind) => (
            <tr key={ind.key}>
              <th scope="row" title={explain(ind.key, t)}>{ind.key}</th>
              <td>
                <button
                  className="tstats__cell mono"
                  disabled={ind.current === undefined}
                  onClick={() => setReport({ key: ind.key, end: n - 1 })}
                >
                  {formatStat(ind.current, precision)}
                </button>
              </td>
              <td>
                <button
                  className="tstats__cell mono"
                  disabled={ind.best === undefined}
                  onClick={() => setReport({ key: ind.key, end: ind.bestEnd })}
                >
                  {formatStat(ind.best, precision)}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tlist">
        <div className="tlist__head tertiary">
          <span>#</span>
          <span>{t("Time")}</span>
          <span>ao5</span>
          <span>ao12</span>
        </div>
        {n === 0 ? (
          <p className="tertiary tlist__empty">{t("Your solves will show up here.")}</p>
        ) : (
          <ol className="tlist__rows" reversed>
            {rows.map((i) => {
              const s = session.solves[i];
              return (
                <li key={s.id}>
                  <button className="tlist__row" onClick={() => setOpen(i)}>
                    <span className="tertiary mono">
                      {i + 1}
                      {s.comment ? "*" : ""}
                    </span>
                    <span className={`mono${i === stats.bestIndex ? " tlist__pb" : ""}`}>
                      {formatSolve(s, precision)}
                    </span>
                    <span className="mono muted">{formatStat(ao5[i], precision)}</span>
                    <span className="mono muted">{formatStat(ao12[i], precision)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {n > shown && (
          <button className="pill pill--plain tlist__more" onClick={() => setShown((v) => v + 200)}>
            {t("Show more")}
          </button>
        )}
      </div>

      {open !== null && session.solves[open] && (
        <SolveDialog
          index={open}
          solve={session.solves[open]}
          sessionId={session.id}
          precision={precision}
          onClose={() => setOpen(null)}
        />
      )}
      {report && (
        <ReportDialog
          session={session}
          indicatorKey={report.key}
          end={report.end}
          precision={precision}
          trimPct={trimPct}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
}

/** What an average means, for the row's tooltip ("ao5" → plain words). */
function explain(key: string, t: (k: string) => string): string {
  const n = key.slice(2);
  return key.startsWith("mo")
    ? t("Mean of {n}: the average of your last {n} solves.").replace(/\{n\}/g, n)
    : t("Average of {n}: your last {n} solves with the best and worst dropped, like an official WCA average.").replace(/\{n\}/g, n);
}

/** `raw` keeps the label's case (σ must not become Σ). */
function Stat({ label, value, raw, hint }: { label: string; value: string; raw?: boolean; hint?: string }) {
  return (
    <div className="tstats__stat" title={hint}>
      <span className={`tstats__label${raw ? " tstats__label--raw" : ""}`}>{label}</span>
      <span className="tstats__value mono">{value}</span>
    </div>
  );
}

/** A native <dialog> shown modally; Escape and the backdrop close it. */
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`tdialog${wide ? " tdialog--wide" : ""}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="tdialog__head">
        <h2 className="tdialog__title">{title}</h2>
        <button className="btn btn--ghost tdialog__close" onClick={() => ref.current?.close()}>
          {t("Close")}
        </button>
      </div>
      <div className="tdialog__body">{children}</div>
    </dialog>
  );
}

function SolveDialog({
  index,
  solve,
  sessionId,
  precision,
  onClose,
}: {
  index: number;
  solve: TimerSolve;
  sessionId: string;
  precision: Precision;
  onClose: () => void;
}) {
  const { t } = useT();
  const [comment, setComment] = useState(solve.comment ?? "");
  const setPenalty = (penalty: Penalty) => timerStore.updateSolve(sessionId, solve.id, { penalty });
  const phases = solve.splits && solve.splits.length > 1 ? phaseDurations(solve.splits) : null;

  return (
    <Modal title={`${t("Solve")} ${index + 1}`} onClose={onClose}>
      <div className="tsolve">
        <div className="tsolve__time mono">{formatSolve(solve, precision, true)}</div>
        {phases && (
          <div className="tertiary mono">
            {phases.map((p) => formatTime(p, precision)).join(" + ")}
          </div>
        )}
        <PenaltyChips penalty={solve.penalty} onChange={setPenalty} />
        {solve.scramble && (
          <button
            className="tsolve__scramble mono"
            title={t("Copy scramble")}
            onClick={() => void navigator.clipboard?.writeText(solve.scramble)}
          >
            {solve.scramble}
          </button>
        )}
        <span className="tertiary">{new Date(solve.at).toLocaleString()}</span>
        <label className="tsolve__comment">
          <span className="tertiary">{t("Comment")}</span>
          <input
            className="input"
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => {
              if (comment !== (solve.comment ?? "")) {
                timerStore.updateSolve(sessionId, solve.id, { comment: comment || undefined });
              }
            }}
          />
        </label>
        <div className="tsolve__actions">
          <button
            className="btn btn--secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(
                `${formatSolve(solve, precision)}   ${solve.scramble}`.trim(),
              )
            }
          >
            {t("Copy solve")}
          </button>
          <button
            className="btn btn--ghost tsolve__delete"
            onClick={() => {
              if (window.confirm(t("Delete this solve?"))) {
                timerStore.deleteSolve(sessionId, solve.id);
                onClose();
              }
            }}
          >
            {t("Delete")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** OK / +2 / DNF toggle, shared by the solve dialog and the post-solve row. */
export function PenaltyChips({
  penalty,
  onChange,
}: {
  penalty: Penalty;
  onChange: (p: Penalty) => void;
}) {
  const { t } = useT();
  const opts: { p: Penalty; label: string }[] = [
    { p: 0, label: t("OK") },
    { p: 2000, label: "+2" },
    { p: -1, label: "DNF" },
  ];
  return (
    <div className="post__marks" role="group" aria-label={t("Penalty")}>
      {opts.map((o) => (
        <button
          key={o.p}
          className={`post__chip${penalty === o.p ? " is-on" : ""}${o.p === -1 ? " post__chip--dnf" : o.p === 2000 ? " post__chip--plus2" : ""}`}
          aria-pressed={penalty === o.p}
          onClick={() => onChange(o.p)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The solves in one average window, trimmed ones in parentheses; copyable. */
function ReportDialog({
  session,
  indicatorKey,
  end,
  precision,
  trimPct,
  onClose,
}: {
  session: TimerSession;
  indicatorKey: string;
  end: number;
  precision: Precision;
  trimPct: number;
  onClose: () => void;
}) {
  const { t } = useT();
  const kind = indicatorKey.startsWith("mo") ? "mo" : "ao";
  const size = Number(indicatorKey.slice(2));
  const windowSolves = session.solves.slice(end - size + 1, end + 1);
  const trim = trimCount(size, kind, trimPct);
  // Mark the `trim` best and worst (DNFs sort worst) as trimmed.
  const order = windowSolves
    .map((s, i) => ({ i, v: solveValue(s, precision) }))
    .sort((a, b) => a.v - b.v || a.i - b.i);
  const trimmed = new Set([...order.slice(0, trim), ...order.slice(order.length - trim)].map((o) => o.i));
  const lines = windowSolves.map((s, i) => {
    const text = formatSolve(s, precision);
    return `${i + 1}. ${trimmed.has(i) ? `(${text})` : text}${s.scramble ? `   ${s.scramble}` : ""}`;
  });
  const text = lines.join("\n");
  return (
    <Modal title={indicatorKey} onClose={onClose} wide>
      <pre className="treport mono">{text}</pre>
      <button className="btn btn--secondary" onClick={() => void navigator.clipboard?.writeText(text)}>
        {t("Copy")}
      </button>
    </Modal>
  );
}
