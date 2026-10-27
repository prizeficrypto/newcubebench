import express from "express";
import {
  destroySession,
  disconnectWca,
  finishWcaFlow,
  googleAuthAvailable,
  publicUser,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  startWcaFlow,
  updateProfile,
} from "../auth.ts";
import { wcaAvailable } from "../wcaOauth.ts";
import { bearerToken, limit, requireUser, wrap } from "../http.ts";

/**
 * Accounts: sign up / sign in (email + password, Google, WCA), the current
 * user, profile edits, connecting a WCA account, and sign-out. Accounts are
 * free and optional: they hold the cloud copy of a cuber's times and their
 * social profile.
 */
export const accountRouter = express.Router();

const authLimiter = limit(10 * 60 * 1000, 30); // 30 / 10 min
// A WCA round trip is two calls (start + finish) and nothing to guess, so it
// gets its own, roomier budget: whole classrooms share one IP. Still bounded,
// because every finish costs two requests to the WCA.
const wcaLimiter = limit(10 * 60 * 1000, 60); // 60 / 10 min

/** A string field from the JSON body, or "" when absent or not a string. */
function field(req: express.Request, name: string): string {
  const value = (req.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === "string" ? value : "";
}

// What this server can actually do (drives which buttons the client shows).
accountRouter.get("/api/auth/config", (_req, res) => {
  res.json({
    googleAvailable: googleAuthAvailable(),
    wcaAvailable: wcaAvailable(),
  });
});

accountRouter.post(
  "/api/auth/google",
  authLimiter,
  wrap(async (req, res) => {
    const credential = field(req, "credential");
    if (!credential) {
      res.status(400).json({ error: "Missing Google credential." });
      return;
    }
    const { user, token } = await signInWithGoogle(credential);
    res.json({ user: publicUser(user), token });
  }),
);

accountRouter.post(
  "/api/auth/signup",
  authLimiter,
  wrap(async (req, res) => {
    const { user, token } = await signUpWithEmail(
      field(req, "email"),
      field(req, "password"),
      field(req, "name"),
    );
    res.json({ user: publicUser(user), token });
  }),
);

accountRouter.post(
  "/api/auth/signin",
  authLimiter,
  wrap(async (req, res) => {
    const { user, token } = await signInWithEmail(
      field(req, "email"),
      field(req, "password"),
    );
    res.json({ user: publicUser(user), token });
  }),
);

/**
 * Begin a WCA OAuth round trip. "signin" works for anyone; "connect" needs a
 * signed-in user, whose id is sealed into the signed state so the callback
 * can only attach the WCA identity to that same account.
 */
accountRouter.post(
  "/api/auth/wca/start",
  wcaLimiter,
  wrap(async (req, res) => {
    const mode = field(req, "mode");
    if (mode !== "signin" && mode !== "connect") {
      res.status(400).json({ error: "Unknown WCA sign-in mode." });
      return;
    }
    if (mode === "signin") {
      res.json(startWcaFlow("signin"));
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    res.json(startWcaFlow("connect", user.id));
  }),
);

/** The WCA redirected back: trade the code and sign in or connect. */
accountRouter.post(
  "/api/auth/wca/finish",
  wcaLimiter,
  wrap(async (req, res) => {
    const result = await finishWcaFlow(
      field(req, "code"),
      field(req, "state"),
      bearerToken(req),
    );
    if (result.mode === "signin") {
      res.json({
        mode: result.mode,
        user: publicUser(result.user),
        token: result.token,
        created: result.created,
      });
    } else {
      res.json({ mode: result.mode, user: publicUser(result.user) });
    }
  }),
);

accountRouter.post(
  "/api/auth/wca/disconnect",
  wrap(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    res.json({ user: publicUser(await disconnectWca(user)) });
  }),
);

accountRouter.get(
  "/api/me",
  wrap(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    // Per-user data: never let a shared cache keep it.
    res.set("Cache-Control", "private, no-store");
    res.json({ user: publicUser(user) });
  }),
);

accountRouter.post(
  "/api/profile",
  wrap(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const displayName =
      typeof req.body?.displayName === "string"
        ? req.body.displayName.trim().slice(0, 80)
        : undefined;
    const avg333 =
      typeof req.body?.avg333 === "string"
        ? req.body.avg333.trim().slice(0, 20)
        : undefined;
    const updated = await updateProfile(user.id, { displayName, avg333 });
    res.json({ user: updated ? publicUser(updated) : null });
  }),
);

accountRouter.post(
  "/api/auth/signout",
  wrap(async (req, res) => {
    await destroySession(bearerToken(req));
    res.json({ status: "ok" });
  }),
);
