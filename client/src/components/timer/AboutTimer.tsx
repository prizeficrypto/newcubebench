import { Link } from "react-router-dom";
import { useT } from "../../lib/i18n.tsx";
import { ABOUT_INTRO, ABOUT_TITLE, FAQ, FEATURES } from "../../lib/seoContent.ts";

/**
 * Below-the-fold About + FAQ on the timer page: what this is, what it does,
 * and direct answers to common questions. It helps first-time visitors, and
 * it's the readable text search engines and AI answer engines index.
 */
export function AboutTimer() {
  const { t } = useT();
  return (
    <section className="tabout tz-hide" aria-labelledby="tabout-title">
      <h2 id="tabout-title" className="tabout__title">{t(ABOUT_TITLE)}</h2>
      <p className="muted tabout__intro">{t(ABOUT_INTRO)}</p>
      <ul className="tabout__features">
        {FEATURES.map((f) => (
          <li key={f}>{t(f)}</li>
        ))}
      </ul>
      <h3 className="group-title">{t("Frequently asked questions")}</h3>
      <div className="group tabout__faq">
        {FAQ.map(([q, a]) => (
          <details key={q} className="tabout__q">
            <summary>{t(q)}</summary>
            <p className="muted">{t(a)}</p>
          </details>
        ))}
      </div>
      <p className="tabout__more tertiary">
        <Link to="/app/competitions">{t("Simulate a WCA competition round")}</Link>
        {" · "}
        <Link to="/welcome">{t("About Cube Bench")}</Link>
      </p>
    </section>
  );
}
