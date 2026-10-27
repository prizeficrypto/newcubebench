import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useT } from "../lib/i18n.tsx";
import { formatCentiseconds, type Attempt } from "../lib/cubing.ts";
import { socialApi, SocialUnavailable, type Board } from "../lib/socialApi.ts";
import "../styles/social.css";

/**
 * Cube Bench users who simulated this exact round. A signed-in user's result
 * is saved once (only a first attempt counts on the board) and can be shared
 * as a link. Only public profiles are listed; you always see your own row.
 */
export type RoundLeaderboardProps = {
  compId: string;
  compName: string;
  eventId: string;
  roundTypeId: string;
  groupId?: string;
  attempts: Attempt[];
  /** WCA average/mean in centiseconds, null when DNF */
  averageCs: number | null;
  /** placement against the official field, null if unknown */
  placement: number | null;
  fieldSize: number | null;
  /** the round ended at the cutoff: shown, but not saved to the board */
  partial?: boolean;
};

export function RoundLeaderboard(p: RoundLeaderboardProps) {
  const { t } = useT();
  const { user } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const saving = useRef(false);

  // Save once the placement is known (or after a moment without one).
  useEffect(() => {
    if (!user || saving.current) return;
    if (p.partial) {
      socialApi
        .board(p.compId, p.eventId, p.roundTypeId)
        .then(setBoard)
        .catch((e) => e instanceof SocialUnavailable && setOff(true));
      return;
    }
    const go = () => {
      if (saving.current) return;
      saving.current = true;
      socialApi
        .saveResult({ ...p, attempts: p.attempts.map((a) => ({ rawMs: a.rawMs, plus2: a.plus2, dnf: Boolean(a.dnf) })) })
        .then((r) => setShareId(r.id))
        .catch((e) => e instanceof SocialUnavailable && setOff(true))
        .finally(() => {
          socialApi
            .board(p.compId, p.eventId, p.roundTypeId)
            .then(setBoard)
            .catch((e) => e instanceof SocialUnavailable && setOff(true));
        });
    };
    if (p.placement !== null) go();
    const id = setTimeout(go, 6000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, p.placement]);

  // Guests still see the board.
  useEffect(() => {
    if (user) return;
    socialApi
      .board(p.compId, p.eventId, p.roundTypeId)
      .then(setBoard)
      .catch((e) => e instanceof SocialUnavailable && setOff(true));
  }, [user, p.compId, p.eventId, p.roundTypeId]);

  if (off) return null;

  const share = async () => {
    if (!shareId) return;
    const url = `${window.location.origin}/app/r/${shareId}`;
    const nav = navigator as Navigator & { share?: (d: { url: string; title: string }) => Promise<void> };
    if (nav.share && window.matchMedia("(hover: none)").matches) {
      await nav.share({ url, title: p.compName }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (cs: number | null) => (cs === null ? "DNF" : formatCentiseconds(cs));

  return (
    <div className="card rboard">
      <div className="rboard__head">
        <h3 className="rboard__title">{t("Cube Bench players on this round")}</h3>
        {board && <span className="tertiary mono">{board.count}</span>}
      </div>
      {!user && (
        <p className="muted rboard__cta">
          <Link to="/join">{t("Sign in")}</Link>{" "}
          {t("to save this result, share it, and see where you rank among Cube Bench players.")}
        </p>
      )}
      {board && board.top.length > 0 && (
        <ol className="rboard__list">
          {board.top.slice(0, 10).map((r, i) => (
            <li key={r.handle} className="rboard__row">
              <span className="tertiary mono">{i + 1}</span>
              <Link to={`/app/u/${r.handle}`} className="rboard__name">
                {r.displayName}
              </Link>
              <span className="mono">{fmt(r.averageCs)}</span>
            </li>
          ))}
        </ol>
      )}
      {board?.you && (
        <p className="rboard__you">
          {t("You")}: <span className="mono">{fmt(board.you.averageCs)}</span> ·{" "}
          {t("#{n} of {total}").replace("{n}", String(board.you.rank)).replace("{total}", String(board.count))}
        </p>
      )}
      {board && board.count === 0 && !user && <p className="tertiary">{t("No one has saved this round yet.")}</p>}
      {shareId && (
        <button className="btn btn--secondary rboard__share" onClick={() => void share()}>
          {copied ? t("Link copied") : t("Share your result")}
        </button>
      )}
    </div>
  );
}
