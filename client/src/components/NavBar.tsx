import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Mark } from "./Mark.tsx";
import { useT } from "../lib/i18n.tsx";
import { LanguageSwitcher } from "./LanguageSwitcher.tsx";

/**
 * Marketing nav for the landing page: wordmark, section anchors, and a
 * "Launch App" action. Transparent while the hero is at rest; the hairline
 * and frosted backdrop fade in once the page scrolls.
 */
export function NavBar() {
  const { t } = useT();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav nav--marketing${scrolled ? " is-scrolled" : ""}`}>
      <nav className="nav__inner container">
        <NavLink to="/" className="nav__wordmark">
          <Mark className="nav__mark" size={15} />
          Cube Bench
        </NavLink>
        <div className="nav__links">
          <a className="nav__link nav__anchor" href="#how">
            {t("How it works")}
          </a>
          <a className="nav__link nav__anchor" href="#why">
            {t("Why")}
          </a>
          <a className="nav__link nav__anchor" href="#faq">
            {t("FAQ")}
          </a>
          <LanguageSwitcher />
          <Link className="btn nav__launch" to="/app">
            {t("Launch App")}
          </Link>
        </div>
      </nav>
    </header>
  );
}
