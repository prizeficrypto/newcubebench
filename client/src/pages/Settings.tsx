import { Link } from "react-router-dom";
import { useT, type Lang } from "../lib/i18n.tsx";
import { useAuth } from "../lib/auth.tsx";

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

  const onPromo = Boolean(user?.promoUntil && user.promoUntil > Date.now());
  const plan = !user
    ? null
    : user.pro
      ? onPromo
        ? t("Pro (free month)")
        : t("Pro")
      : t("Free");

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
            <div className="settings__row">
              <span className="tertiary">{t("Plan")}</span>
              <span>{plan}</span>
            </div>
            <div className="settings__actions">
              <Link className="btn btn--secondary" to="/app/pricing">
                {t("Manage plan")}
              </Link>
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
    </div>
  );
}
