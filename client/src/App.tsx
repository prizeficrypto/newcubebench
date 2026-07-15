import { useEffect } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider, useAuth } from "./lib/auth.tsx";
import { LanguageProvider } from "./lib/i18n.tsx";
import { NavBar } from "./components/NavBar.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { Onboarding } from "./components/Onboarding.tsx";
import { Mark } from "./components/Mark.tsx";
import Home from "./pages/Home.tsx";
import Simulator from "./pages/Simulator.tsx";
import SkillTimer from "./pages/SkillTimer.tsx";
import Pricing from "./pages/Pricing.tsx";
import Settings from "./pages/Settings.tsx";
import Feedback from "./pages/Feedback.tsx";

/**
 * Two worlds:
 *   /        — marketing landing page (no app tabs, just "Launch App")
 *   /app/*   — the product, behind onboarding (account + profile), with its
 *              own navigation: Competitions, Skill Timer, Pricing.
 * Old top-level routes redirect into the app.
 */
export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
      <BrowserRouter>
        <Routes>
          {/* The app is the front door now: land straight in the Simulator.
              The marketing page moves to /welcome, reached from a nav button. */}
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route
            path="/welcome"
            element={
              <>
                <NavBar />
                <main className="app">
                  <Home />
                </main>
              </>
            }
          />

          {/* Sign-up / sign-in screen. Guests are sent here from the app's
              "create an account to do more" walls. */}
          <Route path="/join" element={<JoinScreen />} />

          <Route path="/app" element={<AppShell />}>
            <Route index element={<Simulator />} />
            <Route path="skill-timer" element={<SkillTimer />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="settings" element={<Settings />} />
            <Route path="feedback" element={<Feedback />} />
          </Route>

          {/* legacy paths from the tabbed layout */}
          <Route path="/simulator" element={<Navigate to="/app" replace />} />
          <Route path="/skill-timer" element={<Navigate to="/app/skill-timer" replace />} />
          <Route path="/pricing" element={<Navigate to="/app/pricing" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        <Analytics />
      </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}

/**
 * The account screen (sign up / sign in, then the quick profile). Once the
 * user is signed in with a profile, bounce them into the app. Guests reach
 * this from the "create an account to do more" prompts.
 */
function JoinScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user && user.profile.avg333) navigate("/app", { replace: true });
  }, [user, navigate]);
  return (
    <>
      <header className="nav">
        <nav className="nav__inner container">
          <Link to="/" className="nav__wordmark">
            <Mark className="nav__mark" size={15} />
            Cube Bench
          </Link>
        </nav>
      </header>
      <main className="app">
        <Onboarding />
      </main>
    </>
  );
}

/** Unknown URLs get a page, not a blank screen. */
function NotFound() {
  return (
    <>
      <NavBar />
      <main className="app">
        <div className="screen container container--gate notfound">
          <span className="eyebrow">404</span>
          <h1 className="title">This page doesn't exist.</h1>
          <p className="muted gate__sub">
            Maybe the scramble was bad. The app and the landing page are still
            where they always were.
          </p>
          <div className="notfound__actions">
            <Link className="btn" to="/app">
              Launch App
            </Link>
            <Link className="btn btn--ghost" to="/">
              Go home
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
