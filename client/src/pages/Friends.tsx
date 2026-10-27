import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useT } from "../lib/i18n.tsx";
import { formatTime } from "../lib/timer/format.ts";
import { eventName, TIMER_EVENTS } from "../lib/timer/puzzles.ts";
import { socialApi, SocialUnavailable, type FriendRow } from "../lib/socialApi.ts";
import "../styles/social.css";

/**
 * Friends: find cubers by username, and a leaderboard of you and everyone you
 * follow, by personal best, for one event at a time.
 */
export default function Friends() {
  const { t } = useT();
  const { user, loading } = useAuth();
  const [event, setEvent] = useState("333");
  const [sort, setSort] = useState<"single" | "ao5" | "ao12">("ao5");
  const [rows, setRows] = useState<FriendRow[] | null>(null);
  const [off, setOff] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ handle: string; displayName: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    socialApi
      .friends(event)
      .then((r) => setRows(r.people))
      .catch((e) => (e instanceof SocialUnavailable ? setOff(true) : setRows([])));
  }, [user, event]);

  useEffect(() => {
    if (!user || q.trim().length < 2) {
      setFound([]);
      return;
    }
    const id = setTimeout(() => {
      socialApi.search(q.trim()).then((r) => setFound(r.people)).catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q, user]);

  if (loading) return <div className="gate-loading"><div className="spinner" /></div>;
  if (!user) {
    return (
      <div className="screen container social-page">
        <span className="eyebrow">{t("Friends")}</span>
        <h1 className="title">{t("Cube with your friends.")}</h1>
        <p className="muted">
          {t("Follow other cubers, compare personal bests event by event, and see how they did on the same competition rounds. It's free.")}
        </p>
        <Link className="btn" to="/join">{t("Create a free account")}</Link>
      </div>
    );
  }
  if (off) {
    return (
      <div className="screen container social-page">
        <h1 className="title">{t("Friends are coming soon.")}</h1>
      </div>
    );
  }

  const me = rows?.find((r) => r.isMe);
  const ranked = [...(rows ?? [])].sort((a, b) => (a[sort] ?? Infinity) - (b[sort] ?? Infinity));
  const ms = (v: number | null) => (v === null ? "–" : formatTime(v));

  return (
    <div className="screen container social-page">
      <span className="eyebrow">{t("Friends")}</span>
      <h1 className="title">{t("Friends")}</h1>
      {me && !me.handle && (
        <p className="social-note">
          {t("Set up your public profile so friends can find and follow you.")}{" "}
          <Link to="/app/settings">{t("Go to settings")}</Link>
        </p>
      )}

      <section className="card social-card">
        <h2 className="social-card__title">{t("Find cubers")}</h2>
        <input
          className="input"
          placeholder={t("Search by username")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {found.length > 0 && (
          <ul className="social-list">
            {found.map((f) => (
              <li key={f.handle}>
                <Link to={`/app/u/${f.handle}`} className="social-list__row">
                  <span>{f.displayName}</span>
                  <span className="tertiary">@{f.handle}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card social-card">
        <div className="social-card__bar">
          <h2 className="social-card__title">{t("Leaderboard")}</h2>
          <select className="input social-select" value={event} onChange={(e) => setEvent(e.target.value)} aria-label={t("Puzzle")}>
            {TIMER_EVENTS.filter((e) => e.id !== "none" && e.id !== "333fm").map((e) => (
              <option key={e.id} value={e.id}>{t(e.name)}</option>
            ))}
          </select>
        </div>
        {rows === null ? (
          <div className="spinner spinner--sm" />
        ) : rows.length <= 1 ? (
          <p className="tertiary">{t("Follow people to compare personal bests here.")}</p>
        ) : (
          <table className="pbtable">
            <thead>
              <tr>
                <th>#</th>
                <th />
                {(["single", "ao5", "ao12"] as const).map((k) => (
                  <th key={k}>
                    <button className={`pbtable__sort${sort === k ? " is-on" : ""}`} onClick={() => setSort(k)}>
                      {k === "single" ? t("Single") : k}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.handle ?? "me"} className={r.isMe ? "pbtable__me" : ""}>
                  <td className="tertiary mono">{i + 1}</td>
                  <th scope="row">
                    {r.handle && !r.isMe ? <Link to={`/app/u/${r.handle}`}>{r.displayName}</Link> : `${r.displayName} (${t("you")})`}
                  </th>
                  <td className="mono">{ms(r.single)}</td>
                  <td className="mono">{ms(r.ao5)}</td>
                  <td className="mono">{ms(r.ao12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="tertiary social-card__foot">
          {t("Personal bests come from practice times saved to each account.")} {t(eventName(event))}
        </p>
      </section>
    </div>
  );
}
