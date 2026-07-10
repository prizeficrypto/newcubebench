import { useState } from "react";
import { submitFeedback } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useT } from "../lib/i18n.tsx";

type Kind = "bug" | "suggestion";

/**
 * Report a bug or suggest an idea. Open to guests; when signed in the account
 * is attached server-side and the reply email is prefilled. Nothing here blocks
 * on an external service — it posts to our own /api/feedback.
 */
export default function Feedback() {
  const { t } = useT();
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      setError(t("Please add a little more detail."));
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      await submitFeedback({
        kind,
        message: trimmed,
        email: email.trim() || undefined,
      });
      setStatus("sent");
      setMessage("");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : t("Something went wrong. Please try again."));
    }
  }

  if (status === "sent") {
    return (
      <div className="screen container settings feedback">
        <div className="settings__head">
          <span className="eyebrow">{t("Feedback")}</span>
          <h1 className="title">{t("Thanks, we got it.")}</h1>
          <p className="muted">
            {t("Every report and idea is read. If you left an email we'll reach out when it helps.")}
          </p>
        </div>
        <button className="btn btn--secondary" onClick={() => setStatus("idle")}>
          {t("Send another")}
        </button>
      </div>
    );
  }

  return (
    <div className="screen container settings feedback">
      <div className="settings__head">
        <span className="eyebrow">{t("Feedback")}</span>
        <h1 className="title">{t("Report a bug or suggest an idea")}</h1>
        <p className="muted">
          {t("Found something broken, or have an idea to make Cube Bench better? Tell us here.")}
        </p>
      </div>

      <form className="card settings__section feedback__form" onSubmit={send}>
        <div className="fb-kind" role="radiogroup" aria-label={t("Feedback type")}>
          <button
            type="button"
            role="radio"
            aria-checked={kind === "bug"}
            className={`fb-kind__btn${kind === "bug" ? " is-active" : ""}`}
            onClick={() => setKind("bug")}
          >
            {t("Bug")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === "suggestion"}
            className={`fb-kind__btn${kind === "suggestion" ? " is-active" : ""}`}
            onClick={() => setKind("suggestion")}
          >
            {t("Suggestion")}
          </button>
        </div>

        <label className="fb-field">
          <span className="fb-field__label">
            {kind === "bug" ? t("What went wrong?") : t("What's your idea?")}
          </span>
          <textarea
            className="fb-field__input fb-field__textarea"
            value={message}
            maxLength={4000}
            rows={6}
            placeholder={
              kind === "bug"
                ? t("What did you do, and what happened instead?")
                : t("Describe what you'd like to see.")
            }
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
          />
        </label>

        <label className="fb-field">
          <span className="fb-field__label">{t("Email (optional, for a reply)")}</span>
          <input
            className="fb-field__input"
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {error && <p className="gate__error">{error}</p>}

        <button className="btn" type="submit" disabled={status === "sending"}>
          {status === "sending" ? t("Sending…") : t("Send feedback")}
        </button>
      </form>
    </div>
  );
}
