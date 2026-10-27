import express from "express";
import { sql } from "../db.ts";
import { userForToken } from "../auth.ts";
import { bearerToken, limit, wrap } from "../http.ts";

/**
 * In-app feedback (bug reports and suggestions) plus the legacy early-access
 * email capture. Both are open to guests and rate-limited per IP.
 */
export const feedbackRouter = express.Router();

const captureLimiter = limit(10 * 60 * 1000, 10); // 10 / 10 min

const EMAIL_MAX_LEN = 254;
// Deliberately loose shape check — the goal is catching typos, not RFC 5322.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Honest email capture only — just an email stored in Postgres. Idempotent per
// address (ON CONFLICT DO NOTHING).
feedbackRouter.post(
  "/api/early-access",
  captureLimiter,
  wrap(async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    if (!email || email.length > EMAIL_MAX_LEN || !EMAIL_SHAPE.test(email)) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    await sql`
      insert into early_access (email) values (${email})
      on conflict (email) do nothing
    `;
    res.json({ status: "ok" });
  }),
);

// In-app feedback: bug reports and suggestions. Open to guests (an account is
// not required to tell us something's broken). All fields are bounded and the
// contact email is optional; the signed-in user is attached when present.
const FEEDBACK_MIN_LEN = 3;
const FEEDBACK_MAX_LEN = 4000;

feedbackRouter.post(
  "/api/feedback",
  captureLimiter,
  wrap(async (req, res) => {
    const kindRaw = typeof req.body?.kind === "string" ? req.body.kind : "";
    const kind = kindRaw === "bug" || kindRaw === "suggestion" ? kindRaw : "";
    if (!kind) {
      res.status(400).json({ error: "Choose whether this is a bug or a suggestion." });
      return;
    }
    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (message.length < FEEDBACK_MIN_LEN) {
      res.status(400).json({ error: "Please add a little more detail." });
      return;
    }
    const emailRaw =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const email =
      emailRaw && emailRaw.length <= EMAIL_MAX_LEN && EMAIL_SHAPE.test(emailRaw)
        ? emailRaw
        : null;
    const path =
      typeof req.body?.path === "string" ? req.body.path.slice(0, 300) : null;
    const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 400);
    // Attach the account if the request is authenticated; guests stay null.
    const user = await userForToken(bearerToken(req));

    await sql`
      insert into feedback (kind, message, email, user_id, path, user_agent)
      values (
        ${kind},
        ${message.slice(0, FEEDBACK_MAX_LEN)},
        ${email},
        ${user?.id ?? null},
        ${path},
        ${userAgent}
      )
    `;
    res.json({ status: "ok" });
  }),
);
