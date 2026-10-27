import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useCloudSync } from "../lib/cloudSync.ts";
import { Mark } from "./Mark.tsx";
import { useT } from "../lib/i18n.tsx";

/**
 * The app frame: top nav + the current page. Open to everyone — the timer and
 * every competition work without an account. Rendering never waits on the
 * session check: the timer paints immediately and the account chip fills in
 * once we know who you are.
 */
export function AppShell() {
  const { user, loading, signOut } = useAuth();
  const { t } = useT();
  useCloudSync();

  const shownName = user ? (user.profile.displayName ?? user.name) : "";
  const initials = shownName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  const link = ({ isActive }: { isActive: boolean }) =>
    `nav__link${isActive ? " is-active" : ""}`;

  return (
    <>
      <header className="nav nav--app">
        <nav className="nav__inner container">
          <NavLink to="/app" end className="nav__wordmark">
            <Mark className="nav__mark" size={15} />
            Cube Bench
          </NavLink>
          <div className="nav__links">
            <NavLink to="/app" end className={link}>
              {t("Timer")}
            </NavLink>
            <NavLink to="/app/competitions" className={link}>
              {t("Competitions")}
            </NavLink>
            <NavLink to="/app/friends" className={link}>
              {t("Friends")}
            </NavLink>
            <NavLink to="/app/settings" className={link}>
              {t("Settings")}
            </NavLink>
            <Link to="/welcome" className="nav__link">
              {t("About")}
            </Link>
            {loading ? null : user ? (
              <>
                <span className="nav__user-chip" title={user.email}>
                  <span className="nav__avatar" aria-hidden="true">
                    {initials || "?"}
                  </span>
                  <span className="nav__username tertiary">{shownName}</span>
                </span>
                <button
                  className="nav__link nav__signout"
                  onClick={() => signOut()}
                >
                  {t("Sign out")}
                </button>
              </>
            ) : (
              <Link to="/join" className="btn nav__join">
                {t("Sign in")}
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main className="app">
        <Suspense
          fallback={
            <div className="gate-loading">
              <div className="spinner" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      {/* Phones: an iOS-style tab bar replaces the nav links. */}
      <nav className="tabbar" aria-label={t("Sections")}>
        <NavLink to="/app" end className={({ isActive }) => `tabbar__item${isActive ? " is-active" : ""}`}>
          {t("Timer")}
        </NavLink>
        <NavLink to="/app/competitions" className={({ isActive }) => `tabbar__item${isActive ? " is-active" : ""}`}>
          {t("Competitions")}
        </NavLink>
        <NavLink to="/app/friends" className={({ isActive }) => `tabbar__item${isActive ? " is-active" : ""}`}>
          {t("Friends")}
        </NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => `tabbar__item${isActive ? " is-active" : ""}`}>
          {t("Settings")}
        </NavLink>
      </nav>
      <footer className="app-foot">
        <NavLink to="/app/feedback" className="app-foot__link">
          {t("Report a bug or suggest something")}
        </NavLink>
        <Link to="/privacy" className="app-foot__link">
          {t("Privacy")}
        </Link>
      </footer>
    </>
  );
}
