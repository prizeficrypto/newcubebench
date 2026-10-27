import type express from "express";
import { rateLimit } from "express-rate-limit";
import { userForToken } from "./auth.ts";

/**
 * Small HTTP helpers shared by every route module: async wrapping, per-IP rate
 * limits, and bearer-token auth. Kept here so each router stays focused on its
 * own endpoints.
 */

type Handler = (
  req: express.Request,
  res: express.Response,
) => Promise<unknown>;

/** Wrap async handlers so rejections hit the error middleware instead of
 *  hanging the request (no hidden failures). */
export const wrap =
  (fn: Handler) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) =>
    fn(req, res).catch(next);

/** Per-IP, in-memory rate limit. On serverless each instance counts on its
 *  own, which still blunts bursts from a single client. */
export const limit = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — slow down a little.", status: 429 },
  });

export function bearerToken(req: express.Request): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

/** The signed-in user, or a 401 written to `res` and null returned. */
export async function requireUser(req: express.Request, res: express.Response) {
  const user = await userForToken(bearerToken(req));
  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return null;
  }
  return user;
}
