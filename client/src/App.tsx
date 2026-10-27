import { lazy, Suspense, useEffect } from "react";
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
import Timer from "./pages/Timer.tsx";
import { usePageMeta } from "./lib/seo.ts";

// The timer is the front door and ships in the main bundle; everything else
// loads on demand so a first visit paints the timer as fast as possible.
const Home = lazy(() => import("./pages/Home.tsx"));
const Simulator = lazy(() => import("./pages/Simulator.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Feedback = lazy(() => import("./pages/Feedback.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Friends = lazy(() => import("./pages/Friends.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const SharedResult = lazy(() => import("./pages/SharedResult.tsx"));
const WcaCallback = lazy(() => import("./pages/WcaCallback.tsx"));

/**
 * Routes:
 *   /                 — the timer (the homepage)
 *   /app              → redirects to /
 *   /app/competitions — the competition simulator
 *   /app/friends, /app/u/:handle, /app/r/:id — social
 *   /app/settings, /app/feedback
 *   /welcome          — the marketing page ("About" in the nav)
 *   /join             — sign up / sign in
 *   /auth/wca         — WCA OAuth redirect target
 *   /privacy          — privacy policy
 * Old paths redirect.
 */
export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              {/* The timer IS the homepage: served at "/", no redirect. */}
              <Route path="/" element={<AppShell />}>
                <Route index element={<Timer />} />
              </Route>
              {/* One landing page per puzzle: /timer/2x2, /timer/megaminx … */}
              <Route path="/timer/:puzzle" element={<AppShell />}>
                <Route index element={<Timer />} />
              </Route>
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

              {/* Sign-up / sign-in screen. */}
              <Route path="/join" element={<JoinScreen />} />
              <Route path="/auth/wca" element={<WcaCallback />} />
              <Route
                path="/privacy"
                element={
                  <>
                    <NavBar />
                    <main className="app">
                      <Privacy />
                    </main>
                  </>
                }
              />

              <Route path="/app" element={<AppShell />}>
                <Route index element={<Navigate to="/" replace />} />
                <Route path="competitions" element={<Simulator />} />
                <Route path="friends" element={<Friends />} />
                <Route path="u/:handle" element={<Profile />} />
                <Route path="r/:id" element={<SharedResult />} />
                <Route path="settings" element={<Settings />} />
                <Route path="feedback" element={<Feedback />} />
                <Route path="skill-timer" element={<Navigate to="/" replace />} />
                <Route path="pricing" element={<Navigate to="/" replace />} />
              </Route>

              {/* legacy paths from the tabbed layout */}
              <Route path="/simulator" element={<Navigate to="/app/competitions" replace />} />
              <Route path="/skill-timer" element={<Navigate to="/" replace />} />
              <Route path="/pricing" element={<Navigate to="/" replace />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Analytics />
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}

function PageLoading() {
  return (
    <div className="gate-loading">
      <div className="spinner" />
    </div>
  );
}

/**
 * The account screen (sign up / sign in, then the quick profile). Once the
 * user is signed in with a profile, bounce them into the app.
 */
function JoinScreen() {
  const { user } = useAuth();
  usePageMeta({ title: "Sign in | Cube Bench", noindex: true });
  const navigate = useNavigate();
  useEffect(() => {
    if (user && user.profile.avg333) navigate("/", { replace: true });
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
            Maybe the scramble was bad. The timer is still where it always was.
          </p>
          <div className="notfound__actions">
            <Link className="btn" to="/">
              Open the timer
            </Link>
            <Link className="btn btn--ghost" to="/welcome">
              About Cube Bench
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
