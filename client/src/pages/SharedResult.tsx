import { usePageMeta } from "../lib/seo.ts";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useT } from "../lib/i18n.tsx";
import { formatAttempt, formatCentiseconds, ordinal } from "../lib/cubing.ts";
import { eventOrDefault } from "../lib/events.ts";
import { socialApi, type SharedResult as Result } from "../lib/socialApi.ts";
import "../styles/social.css";

/** A shared simulator result at /app/r/:id. Public, by unguessable link. */
export default function SharedResult() {
  const { id = "" } = useParams();
  const { t } = useT();
  const [r, setR] = useState<Result | null>(null);
  const [missing, setMissing] = useState(false);
  usePageMeta({
    title: r ? `${r.displayName ?? "A Cube Bench player"} at ${r.compName} | Cube Bench` : "Shared result | Cube Bench",
    description: r ? `A simulated ${r.compName} round on Cube Bench. Try the same scrambles yourself.` : undefined,
    path: `/app/r/${id}`,
  });

  useEffect(() => {
    socialApi.result(id).then(setR).catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return (
      <div className="screen container social-page">
        <h1 className="title">{t("This result isn't available.")}</h1>
        <Link className="btn" to="/app/competitions">{t("Simulate a round yourself")}</Link>
      </div>
    );
  }
  if (!r) return <div className="gate-loading"><div className="spinner" /></div>;

  const ev = eventOrDefault(r.eventId);
  const who = r.displayName ?? t("A Cube Bench player");
  const tryHref = `/app/competitions?comp=${encodeURIComponent(r.compId)}&event=${encodeURIComponent(r.eventId)}&round=${encodeURIComponent(r.roundTypeId)}`;

  return (
    <div className="screen container social-page shared">
      <span className="eyebrow">{r.compName}</span>
      <h1 className="title">
        {r.handle ? <Link to={`/app/u/${r.handle}`}>{who}</Link> : who}
      </h1>
      <p className="muted">{ev.display} · {t(ev.formatName)}</p>
      <div className="shared__avg mono">{r.averageCs === null ? "DNF" : formatCentiseconds(r.averageCs)}</div>
      {r.placement && r.fieldSize && (
        <p className="shared__place">
          {t("Would have placed")} <strong className="mono">{ordinal(r.placement)}</strong> {t("of")}{" "}
          <span className="mono">{r.fieldSize}</span>
        </p>
      )}
      <div className="shared__attempts">
        {r.attempts.map((a, i) => (
          <span key={i} className="solve-pill mono">{formatAttempt({ rawMs: a.rawMs, plus2: a.plus2, dnf: a.dnf })}</span>
        ))}
      </div>
      <Link className="btn" to={tryHref}>{t("Try this round yourself")}</Link>
    </div>
  );
}
