import { usePageMeta } from "../lib/seo.ts";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, WCA_RETURN_KEY } from "../lib/auth.tsx";
import { useT } from "../lib/i18n.tsx";

/**
 * Landing page for the WCA OAuth redirect (/auth/wca?code=…&state=…). Hands
 * the one-time code to our server, which verifies the signed state, trades the
 * code with the WCA and signs in (or connects the account). Then back to
 * where the user started; a brand-new account first sets up its profile.
 */
export default function WcaCallback() {
  const { t } = useT();
  usePageMeta({ title: "Signing in | Cube Bench", noindex: true });
  const { finishWca } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // the code is single-use (StrictMode runs effects twice)
    ran.current = true;
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code");
    const state = q.get("state");
    if (q.get("error") || !code || !state) {
      setError(t("WCA sign-in was cancelled."));
      return;
    }
    finishWca(code, state)
      .then(({ mode, created }) => {
        let back = mode === "connect" ? "/app/settings" : "/";
        try {
          back = sessionStorage.getItem(WCA_RETURN_KEY) ?? back;
          sessionStorage.removeItem(WCA_RETURN_KEY);
        } catch {
          /* keep the default */
        }
        navigate(created ? "/join" : back, { replace: true });
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("Couldn't reach the WCA, try again.")));
  }, [finishWca, navigate, t]);

  return (
    <main className="app">
      <div className="screen container container--gate notfound">
        {error ? (
          <>
            <span className="eyebrow">WCA</span>
            <h1 className="title">{t("That didn't work.")}</h1>
            <p className="muted gate__sub">{error}</p>
            <div className="notfound__actions">
              <Link className="btn" to="/join">
                {t("Try again")}
              </Link>
              <Link className="btn btn--ghost" to="/">
                {t("Open the timer")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p className="muted">{t("Signing you in with the WCA…")}</p>
          </>
        )}
      </div>
    </main>
  );
}
