import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth.tsx";
import { NavBar } from "./components/NavBar.tsx";
import { AppShell } from "./components/AppShell.tsx";
import Home from "./pages/Home.tsx";
import Simulator from "./pages/Simulator.tsx";
import SkillTimer from "./pages/SkillTimer.tsx";
import Pricing from "./pages/Pricing.tsx";

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
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <NavBar />
                <main className="app">
                  <Home />
                </main>
              </>
            }
          />

          <Route path="/app" element={<AppShell />}>
            <Route index element={<Simulator />} />
            <Route path="skill-timer" element={<SkillTimer />} />
            <Route path="pricing" element={<Pricing />} />
          </Route>

          {/* legacy paths from the tabbed layout */}
          <Route path="/simulator" element={<Navigate to="/app" replace />} />
          <Route path="/skill-timer" element={<Navigate to="/app/skill-timer" replace />} />
          <Route path="/pricing" element={<Navigate to="/app/pricing" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
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
