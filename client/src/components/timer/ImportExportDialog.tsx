import { useState } from "react";
import { useT } from "../../lib/i18n.tsx";
import {
  eventLabel,
  exportCsTimerJson,
  exportCsv,
  exportFileName,
  exportText,
  fillIssue,
  parseImport,
  type ImportResult,
} from "../../lib/timer/importExport.ts";
import { timerStore } from "../../lib/timer/storage.ts";
import { useTimerSettings } from "../../lib/timer/settings.ts";
import { Modal } from "./StatsPanel.tsx";

/**
 * Import / export for practice sessions. Imports always APPEND as new
 * sessions (csTimer, csTimer CSV, Twisty Timer, Cubic Timer, plain time
 * lists) — nothing existing is ever overwritten. Exports are
 * csTimer-compatible, so times move freely between the two.
 */
export function ImportExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const [{ precision }] = useTimerSettings();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState("");
  if (!open) return null;

  const read = (raw: string, name?: string) => {
    setDone("");
    setText(raw);
    setFileName(name);
    setPreview(raw.trim() ? parseImport(raw, name) : null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    read(await file.text(), file.name);
  };

  const confirmImport = () => {
    if (!preview || preview.sessions.length === 0) return;
    timerStore.addMany(preview.sessions);
    const solves = preview.sessions.reduce((n, s) => n + s.solves.length, 0);
    setDone(
      `${t("Imported")} ${preview.sessions.length} ${t(preview.sessions.length === 1 ? "session" : "sessions")}, ${solves.toLocaleString()} ${t("solves")}.`,
    );
    setPreview(null);
    setText("");
  };

  const download = (content: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const active = timerStore.active();
  const solveCount = preview?.sessions.reduce((n, s) => n + s.solves.length, 0) ?? 0;

  return (
    <Modal title={t("Import / Export")} onClose={onClose} wide>
      <section className="tio">
        <h3 className="tset__group">{t("Import")}</h3>
        <p className="muted tio__lead">
          {t("Bring times from csTimer, Twisty Timer, Cubic Timer, a CSV, or a plain list of times. Imports are added as new sessions; nothing you have is replaced.")}
        </p>
        <label
          className="tio__drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept=".txt,.json,.csv,text/*,application/json"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <span>{fileName ?? t("Choose a file or drop it here")}</span>
        </label>
        <textarea
          className="input tio__paste mono"
          rows={4}
          placeholder={t("…or paste times here, e.g. 12.34, 11.02, DNF(13.50)")}
          value={fileName ? "" : text}
          onChange={(e) => read(e.target.value)}
        />
        {preview && (
          <div className="tio__preview">
            {preview.sessions.length === 0 ? (
              <p className="tio__bad">{t("No solves found in that.")}</p>
            ) : (
              <>
                <p>
                  <strong>{preview.format}</strong> · {preview.sessions.length}{" "}
                  {t(preview.sessions.length === 1 ? "session" : "sessions")} ·{" "}
                  <span className="mono">{solveCount.toLocaleString()}</span> {t("solves")}
                </p>
                <ul className="tio__list">
                  {preview.sessions.slice(0, 8).map((s) => (
                    <li key={s.id} className="tertiary">
                      {s.name} · {eventLabel(s.event)} · <span className="mono">{s.solves.length}</span>
                    </li>
                  ))}
                  {preview.sessions.length > 8 && (
                    <li className="tertiary">+{preview.sessions.length - 8}</li>
                  )}
                </ul>
              </>
            )}
            {preview.issues.slice(0, 4).map((iss, i) => (
              <p key={i} className="tertiary tio__issue">
                {fillIssue(t(iss.message), iss.values)}
              </p>
            ))}
            {preview.sessions.length > 0 && (
              <button className="btn" onClick={confirmImport}>
                {t("Import")}
              </button>
            )}
          </div>
        )}
        {done && <p className="tio__ok">{done}</p>}
      </section>

      <section className="tio">
        <h3 className="tset__group">{t("Export")}</h3>
        <div className="tio__exports">
          <button
            className="btn btn--secondary"
            onClick={() =>
              download(exportCsTimerJson(timerStore.sessions()), exportFileName("txt"), "text/plain")
            }
          >
            {t("All sessions (csTimer format)")}
          </button>
          {active && (
            <>
              <button
                className="btn btn--secondary"
                onClick={() => download(exportCsv(active, { precision }), exportFileName("csv"), "text/csv")}
              >
                {t("This session as CSV")}
              </button>
              <button
                className="btn btn--secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(exportText(active, { precision, t }));
                  setDone(t("Session report copied."));
                }}
              >
                {t("Copy session report")}
              </button>
            </>
          )}
        </div>
      </section>
    </Modal>
  );
}
