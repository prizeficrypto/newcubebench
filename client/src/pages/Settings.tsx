import { Link } from "react-router-dom";
import { useT, type Lang } from "../lib/i18n.tsx";
import { useAuth } from "../lib/auth.tsx";
import { useState } from "react";
import { SocialSettings } from "../components/SocialSettings.tsx";

/**
 * Settings: pick your language, and (when signed in) see your account and
 * plan. Language changes apply instantly across the app and are remembered.
 */
const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
];

export default function Settings() {
  const { t, lang, setLang } = useT();
  const { user, signOut } = useAuth();

  return (
    <div className="screen container settings">
      <div className="settings__head">
        <span className="eyebrow">{t("Settings")}</span>
        <h1 className="title">{t("Settings")}</h1>
      </div>

      <section className="card settings__section">
        <h2 className="settings__title">{t("Language")}</h2>
        <div
          className="settings__langs"
          role="radiogroup"
          aria-label={t("Language")}
        >
          {LANGS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={lang === l.value}
              className={`lvl${lang === l.value ? " is-selected" : ""}`}
              onClick={() => setLang(l.value)}
            >
              <span className="lvl__label">{l.label}</span>
              {lang === l.value && (
                <span className="lvl__range" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="card settings__section">
        <h2 className="settings__title">{t("Account")}</h2>
        {user ? (
          <>
            <div className="settings__row">
              <span className="tertiary">{t("Email")}</span>
              <span className="mono">{user.email}</span>
            </div>
            <div className="settings__actions">
              <button className="btn--ghost btn" onClick={() => signOut()}>
                {t("Sign out")}
              </button>
            </div>
          </>
        ) : (
          <div className="settings__guest">
            <p className="muted">{t("You're browsing as a guest.")}</p>
            <Link className="btn" to="/join">
              {t("Create account")}
            </Link>
          </div>
        )}
      </section>

      {user && <WcaSection />}
      {user && <SocialSettings />}
    </div>
  );
}

/**
 * Connect a WCA account: a verified WCA ID unlocks comparing against your
 * official results and shows on your public profile. Only the WCA can set it.
 */
function WcaSection() {
  const { t } = useT();
  const { user, wcaAvailable, startWca, disconnectWca } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = user?.profile;
  if (!p?.wcaId && !wcaAvailable) return null;

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e) => setError(e instanceof Error ? e.message : t("Something went wrong.")))
      .finally(() => setBusy(false));
  };

  return (
    <section className="card settings__section">
      <h2 className="settings__title">{t("WCA account")}</h2>
      {p?.wcaId ? (
        <>
          <div className="settings__row settings__wca">
            {p.wcaAvatarUrl && <img src={p.wcaAvatarUrl} alt="" className="settings__wca-avatar" />}
            <span>
              {p.wcaName} ·{" "}
              <a
                className="mono"
                href={`https://www.worldcubeassociation.org/persons/${p.wcaId}`}
                target="_blank"
                rel="noreferrer"
              >
                {p.wcaId}
              </a>
            </span>
          </div>
          <div className="settings__actions">
            <button className="btn--ghost btn" disabled={busy} onClick={() => run(disconnectWca)}>
              {t("Disconnect")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            {t("Connect your WCA account to verify your WCA ID. It's used to compare your simulator results with your official ones.")}
          </p>
          <div className="settings__actions">
            <button className="btn btn--secondary" disabled={busy} onClick={() => run(() => startWca("connect"))}>
              {t("Connect WCA account")}
            </button>
          </div>
        </>
      )}
      {error && <p className="gate__error">{error}</p>}
    </section>
  );
}
