import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../lib/i18n.tsx";
import { useSyncStatus } from "../lib/cloudSync.ts";
import { socialApi, SocialUnavailable, type MyProfile } from "../lib/socialApi.ts";
import "../styles/social.css";

/**
 * Settings: cloud-sync status, and the opt-in public profile (username,
 * public toggle, short bio). Profiles are private until switched on, and the
 * note says exactly what becomes visible.
 */
export function SocialSettings() {
  const { t } = useT();
  const sync = useSyncStatus();
  const [loaded, setLoaded] = useState(false);
  const [off, setOff] = useState(false);
  const [form, setForm] = useState<MyProfile>({ handle: "", isPublic: false, bio: "" });
  const [saved, setSaved] = useState<MyProfile | null>(null);
  const [avail, setAvail] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    socialApi
      .me()
      .then(({ profile }) => {
        if (profile) {
          setForm(profile);
          setSaved(profile);
        }
      })
      .catch((e) => e instanceof SocialUnavailable && setOff(true))
      .finally(() => setLoaded(true));
  }, []);

  // Live username availability, after a short pause in typing.
  useEffect(() => {
    const h = form.handle.trim();
    if (!h || h === saved?.handle) {
      setAvail(null);
      return;
    }
    const id = setTimeout(() => {
      socialApi
        .handleAvailable(h)
        .then((r) =>
          setAvail(
            r.available
              ? t("Available")
              : r.reason === "invalid"
                ? t("3 to 20 letters, numbers or underscores")
                : t("Not available"),
          ),
        )
        .catch(() => setAvail(null));
    }, 400);
    return () => clearTimeout(id);
  }, [form.handle, saved?.handle, t]);

  if (off) return null;

  const save = () => {
    setMsg(null);
    socialApi
      .saveProfile({ ...form, handle: form.handle.trim() })
      .then(({ profile }) => {
        setSaved(profile);
        setForm(profile);
        setMsg({ ok: true, text: t("Saved.") });
      })
      .catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : t("Something went wrong.") }));
  };

  const syncLine =
    sync.state === "synced"
      ? `${t("Your times are saved to your account")}${sync.lastSyncedAt ? ` · ${new Date(sync.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`
      : sync.state === "syncing"
        ? t("Saving your times…")
        : sync.state === "offline"
          ? t("Offline. Your times will sync when you're back online.")
          : sync.state === "error"
            ? `${t("Sync paused:")} ${sync.error ?? ""}`
            : "";

  return (
    <>
      {syncLine && (
        <section className="card settings__section">
          <h2 className="settings__title">{t("Cloud-saved times")}</h2>
          <p className={sync.state === "error" ? "social__bad" : "muted"}>{syncLine}</p>
        </section>
      )}
      <section className="card settings__section social-settings">
        <h2 className="settings__title">{t("Public profile")}</h2>
        {!loaded ? (
          <div className="spinner spinner--sm" />
        ) : (
          <>
            <label className="social-settings__field">
              <span className="tertiary">{t("Username")}</span>
              <input
                className="input"
                value={form.handle}
                maxLength={20}
                placeholder="your_name"
                autoComplete="off"
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
              />
              {avail && <span className="tertiary social-settings__hint">{avail}</span>}
            </label>
            <label className="social-settings__field">
              <span className="tertiary">{t("Bio (optional)")}</span>
              <input
                className="input"
                value={form.bio}
                maxLength={160}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </label>
            <label className="social-settings__toggle">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
              />
              <span>{t("Make my profile public")}</span>
            </label>
            <p className="tertiary social-settings__note">
              {t("A public profile shows your username, display name, personal bests, simulated round results and verified WCA ID. People can follow you and you appear on round leaderboards. Your email is never shown.")}
            </p>
            <div className="settings__actions">
              <button className="btn btn--secondary" onClick={save} disabled={!form.handle.trim()}>
                {t("Save profile")}
              </button>
              {saved?.isPublic && (
                <Link className="btn btn--ghost" to={`/app/u/${saved.handle}`}>
                  {t("View profile")}
                </Link>
              )}
            </div>
            {msg && <p className={msg.ok ? "social__ok" : "social__bad"}>{msg.text}</p>}
          </>
        )}
      </section>
    </>
  );
}
