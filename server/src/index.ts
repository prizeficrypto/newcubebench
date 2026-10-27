import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuthError } from "./auth.ts";
import { sql } from "./db.ts";
import { WcaError } from "./wca.ts";
import { accountRouter } from "./routes/account.ts";
import { dataRouter, probeWca } from "./routes/data.ts";
import { feedbackRouter } from "./routes/feedback.ts";
import { socialRouter } from "./routes/social.ts";

/**
 * The Cube Bench API. Thin composition: each concern lives in its own router
 * under routes/ — WCA data, accounts, social, feedback.
 */
const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---- Health probes: liveness and readiness kept distinct ----

// Liveness: the process is up. Never touches upstream.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness: can we actually serve traffic? Confirms the WCA dependency is
// reachable. Fails (503) on upstream breakage so a load balancer won't route
// to an instance that can't do its one job — proxying WCA.
app.get("/ready", async (_req, res) => {
  try {
    await probeWca();
    res.json({ status: "ready" });
  } catch (err) {
    res.status(503).json({
      status: "unavailable",
      dependency: "wca-api",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Daily keep-alive (Vercel Cron, see vercel.json). Supabase's free tier pauses
// a project after 7 days without database activity, which takes sign-in and
// every account feature down; one trivial query a day prevents that. Vercel
// sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set.
app.get("/api/cron/keepalive", async (req, res) => {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    await sql`select 1`;
    res.json({ status: "ok" });
  } catch (err) {
    console.error(`[keepalive] ${err instanceof Error ? err.message : String(err)}`);
    res.status(503).json({ status: "database unavailable" });
  }
});

// AdSense's ads.txt, built from the publisher id so it never needs a redeploy
// of static files. 404 until ADSENSE_PUBLISHER_ID (e.g. "pub-123…") is set.
app.get("/ads.txt", (_req, res) => {
  const pub = (process.env.ADSENSE_PUBLISHER_ID ?? "").trim().replace(/^ca-/, "");
  if (!/^pub-\d{10,20}$/.test(pub)) {
    res.status(404).type("text/plain").send("");
    return;
  }
  res
    .type("text/plain")
    .set("Cache-Control", "public, max-age=3600, s-maxage=86400")
    .send(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
});

app.use(dataRouter);
app.use(accountRouter);
app.use(socialRouter);
app.use(feedbackRouter);

// ---- Serve the built client (production single-service deploy) ----
// In dev this folder doesn't exist and Vite serves the client instead, so
// this block is a no-op locally. API/health routes are registered above, so
// they win; only unmatched GETs fall through to the SPA's index.html.
const CLIENT_DIST = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "client",
  "dist",
);
// On Vercel the client is served by Vercel's CDN, not Express — skip this.
if (!process.env.VERCEL && existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    // Missing build assets 404 rather than getting index.html as "JavaScript".
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/assets/")) {
      return next();
    }
    res.sendFile(join(CLIENT_DIST, "index.html"));
  });
}

// ---- Error handling: explicit, mapped, never swallowed ----
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // Domain errors carry their own status; also honor 4xx from middleware
    // (e.g. express.json parse failures are client errors, not our 5xx).
    const middlewareStatus =
      typeof (err as { status?: unknown })?.status === "number"
        ? ((err as { status: number }).status as number)
        : undefined;
    const domain = err instanceof WcaError || err instanceof AuthError;
    const status = domain
      ? err.status
      : middlewareStatus && middlewareStatus >= 400 && middlewareStatus < 500
        ? middlewareStatus
        : 500;
    const message = err instanceof Error ? err.message : "Unexpected error";
    // Surface as a clean 4xx/5xx with actionable context; log server-side.
    // Unexpected 5xx (e.g. a database error) never echo internals to clients.
    console.error(`[error] ${status} ${message}`);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: domain || status < 500 ? message : "Something went wrong on our side.",
      status,
    });
  },
);

// On Vercel the app is exported as a serverless function (see /api/index.ts)
// and must not open a port. Locally and on a normal host, we listen.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`cube-benchmark server listening on http://localhost:${PORT}`);
  });
}

export default app;
