import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { Mark } from "./Mark.tsx";

/**
 * Everything behind "Launch App". Open to guests — they can run the featured
 * competitions and the regular timer without an account; the "create an
 * account to do more" walls send them to /join. Signed-in users get their
 * profile chip and sign-out.
 */
export function AppShell() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="gate-loading">
        <div className="spinner" />
      </div>
    );
  }

  const shownName = user ? (user.profile.displayName ?? user.name) : "";
  const initials = shownName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <>
      <header className="nav nav--app">
        <nav className="nav__inner container">
          <NavLink to="/" className="nav__wordmark">
            <Mark className="nav__mark" size={15} />
            Cube Bench
          </NavLink>
          <div className="nav__links">
            <NavLink
              to="/app"
              end
              className={({ isActive }) => `nav__link${isActive ? " is-active" : ""}`}
            >
              Competitions
            </NavLink>
            <NavLink
              to="/app/skill-timer"
              className={({ isActive }) => `nav__link${isActive ? " is-active" : ""}`}
            >
              Timer
            </NavLink>
            <NavLink
              to="/app/pricing"
              className={({ isActive }) => `nav__link${isActive ? " is-active" : ""}`}
            >
              Pricing
            </NavLink>
            {user ? (
              <>
                <span className="nav__user-chip" title={user.email}>
                  <span className="nav__avatar" aria-hidden="true">
                    {initials || "?"}
                  </span>
                  <span className="nav__username tertiary">{shownName}</span>
                  {user.pro && <span className="nav__pro">Pro</span>}
                </span>
                <button
                  className="nav__link nav__signout"
                  onClick={() => signOut()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/join" className="btn nav__join">
                Create account
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main className="app">
        <Outlet />
      </main>
    </>
  );
}
