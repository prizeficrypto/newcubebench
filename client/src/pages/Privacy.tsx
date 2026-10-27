import { Link } from "react-router-dom";
import { useT } from "../lib/i18n.tsx";

/**
 * Privacy policy, in plain language. Required for Google AdSense and Google
 * sign-in, and the honest thing to have regardless. Keep it in step with what
 * the app actually stores.
 */
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "The short version",
    body: [
      "Cube Bench is free and supported by ads. You can use the timer and every competition without an account. We keep what we need to run the app, we never sell your personal data, and you can ask us to delete your account at any time.",
    ],
  },
  {
    title: "On your device",
    body: [
      "Your timer sessions, solves, timer settings, language and any round in progress are saved in your browser (local storage and IndexedDB). They stay on your device unless you sign in, and clearing your browser data removes them.",
    ],
  },
  {
    title: "With an account",
    body: [
      "If you create an account we store your email, your name, a securely hashed password (never the password itself) and the profile details you choose to add.",
      "Signed in, your timer sessions are saved to your account so they appear on every device, along with the competition rounds you simulate and your personal bests.",
      "Profiles are private unless you make yours public. A public profile shows your username, display name, personal bests, simulated results and, if you connected one, your WCA ID. Your email is never shown to anyone.",
    ],
  },
  {
    title: "Signing in with Google or the WCA",
    body: [
      "With Google sign-in we receive your name and email from Google to create your account.",
      "With the World Cube Association (WCA), we read your WCA ID, name, country, profile picture and, when you sign in with it, your email. We use them to sign you in and to verify your WCA ID. We don't post anything to the WCA.",
    ],
  },
  {
    title: "Analytics",
    body: [
      "We use Vercel Web Analytics to count page views and see which pages are used. It doesn't use cookies or follow you across other sites.",
    ],
  },
  {
    title: "Advertising",
    body: [
      "Ads are served by Google AdSense. Google and its partners may use cookies or similar identifiers to show ads and measure them, including ads based on your interests where that's allowed. Learn how Google uses this information at policies.google.com/technologies/ads, and change your ad preferences at adssettings.google.com.",
      "Visitors in the European Economic Area, the UK and Switzerland are asked for consent before personalized ads are shown, through Google's consent message.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can export all your times at any time from the timer (Import / Export), make your profile private again, disconnect your WCA account, or ask us to delete your account and everything stored with it through the feedback page. We'll confirm when it's done.",
    ],
  },
  {
    title: "Children",
    body: [
      "Cube Bench isn't directed at children under 13, and we don't knowingly collect personal information from them. If you believe a child has created an account, tell us and we'll delete it.",
    ],
  },
  {
    title: "Changes",
    body: [
      "If this policy changes, we'll update it here and change the date below.",
    ],
  },
];

export default function Privacy() {
  const { t } = useT();
  return (
    <article className="screen container privacy">
      <span className="eyebrow">{t("Privacy")}</span>
      <h1 className="title">{t("Privacy policy")}</h1>
      {SECTIONS.map((s) => (
        <section key={s.title} className="privacy__section">
          <h2 className="privacy__title">{t(s.title)}</h2>
          {s.body.map((p) => (
            <p key={p.slice(0, 24)} className="muted">
              {t(p)}
            </p>
          ))}
        </section>
      ))}
      <p className="tertiary">
        {t("Questions or a deletion request?")}{" "}
        <Link to="/app/feedback">{t("Write to us here.")}</Link>
      </p>
      <p className="tertiary">{t("Last updated: October 26, 2026")}</p>
    </article>
  );
}
