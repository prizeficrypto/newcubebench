import { usePageMeta } from "../lib/seo.ts";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useT } from "../lib/i18n.tsx";
import { formatCentiseconds, ordinal } from "../lib/cubing.ts";
import { formatTime } from "../lib/timer/format.ts";
import { eventName } from "../lib/timer/puzzles.ts";
import { eventOrDefault } from "../lib/events.ts";
import { socialApi, SocialUnavailable, type PublicProfile } from "../lib/socialApi.ts";
import "../styles/social.css";

/** A public cuber profile at /app/u/:handle: PBs, verified WCA ID, results. */
export default function Profile() {
  const { handle = "" } = useParams();
  const { t } = useT();
  const { user } = useAuth();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "off">("loading");
  const [busy, setBusy] = useState(false);
  usePageMeta({
    title: p ? `${p.displayName} (@${p.handle}) · Cube Bench` : "Cuber profile | Cube Bench",
    description: p ? `${p.displayName}'s speedcubing personal bests and simulated WCA rounds on Cube Bench.` : undefined,
    path: `/app/u/${handle}`,
    noindex: state === "missing" || state === "off",
  });

  useEffect(() => {
    setState("loading");
    socialApi
      .profile(handle)
      .then((x) => {
        setP(x);
        setState("ok");
      })
      .catch((e) => setState(e instanceof SocialUnavailable ? "off" : "missing"));
  }, [handle]);

  if (state === "loading") return <div className="gate-loading"><div className="spinner" /></div>;
  if (state !== "ok" || !p) {
    return (
      <div className="screen container social-page">
        <h1 className="title">{state === "off" ? t("Profiles are coming soon.") : t("No public profile here.")}</h1>
        <p className="muted">{t("It may be private, or the username may have changed.")}</p>
        <Link className="btn" to="/app/friends">{t("Find friends")}</Link>
      </div>
    );
  }

  const toggleFollow = () => {
    setBusy(true);
    (p.followedByMe ? socialApi.unfollow(p.handle) : socialApi.follow(p.handle))
      .then(() =>
        setP({ ...p, followedByMe: !p.followedByMe, followers: p.followers + (p.followedByMe ? -1 : 1) }),
      )
      .finally(() => setBusy(false));
  };
  const ms = (v: number | null) => (v === null ? "–" : formatTime(v));
  const since = new Date(`${p.memberSince}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="screen container social-page">
      <header className="profile__head">
        <div>
          <h1 className="title">{p.displayName}</h1>
          <p className="tertiary profile__meta">
            @{p.handle}
            {p.wcaId && (
              <>
                {" · "}
                <a className="mono" href={`https://www.worldcubeassociation.org/persons/${p.wcaId}`} target="_blank" rel="noreferrer">
                  {p.wcaId}
                </a>
              </>
            )}
            {" · "}
            {t("Member since")} {since}
          </p>
          {p.bio && <p className="muted profile__bio">{p.bio}</p>}
          <p className="tertiary profile__counts">
            <span className="mono">{p.followers}</span> {t("followers")} · <span className="mono">{p.following}</span> {t("following")}
          </p>
        </div>
        {user && !p.isMe && (
          <button className={`btn${p.followedByMe ? " btn--secondary" : ""}`} disabled={busy} onClick={toggleFollow}>
            {p.followedByMe ? t("Following") : t("Follow")}
          </button>
        )}
        {p.isMe && <Link className="btn btn--ghost" to="/app/settings">{t("Edit profile")}</Link>}
      </header>

      <section className="card social-card">
        <h2 className="social-card__title">{t("Personal bests")}</h2>
        {p.pbs.length === 0 ? (
          <p className="tertiary">{t("No practice times saved yet.")}</p>
        ) : (
          <table className="pbtable">
            <thead>
              <tr>
                <th />
                <th>{t("Single")}</th>
                <th>ao5</th>
                <th>ao12</th>
              </tr>
            </thead>
            <tbody>
              {p.pbs.map((b) => (
                <tr key={b.event}>
                  <th scope="row">{t(eventName(b.event))}</th>
                  <td className="mono">{ms(b.single)}</td>
                  <td className="mono">{ms(b.ao5)}</td>
                  <td className="mono">{ms(b.ao12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {p.results.length > 0 && (
        <section className="card social-card">
          <h2 className="social-card__title">{t("Simulated rounds")}</h2>
          <ul className="social-list">
            {p.results.map((r) => (
              <li key={r.id}>
                <Link to={`/app/r/${r.id}`} className="social-list__row">
                  <span>
                    {r.compName} · {eventOrDefault(r.eventId).display}
                  </span>
                  <span className="mono">
                    {r.averageCs === null ? "DNF" : formatCentiseconds(r.averageCs)}
                    {r.placement && r.fieldSize ? ` · ${ordinal(r.placement)}/${r.fieldSize}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
