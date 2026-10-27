import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * WCA accounts over OAuth 2 (authorization-code flow).
 *
 * The browser is sent to the WCA's authorize page with a signed `state`, the
 * WCA redirects back to APP_URL/auth/wca with a one-time `code`, and the
 * client hands both to /api/auth/wca/finish. Only this server ever sees the
 * client secret or the access token: it trades the code for a token, reads
 * /api/v0/me once, and throws the token away.
 *
 * The state is stateless on our side (serverless instances share nothing): a
 * base64url JSON payload plus an HMAC-SHA256 tag keyed by the client secret,
 * with a ten-minute expiry. The client also keeps the exact state it was
 * given in sessionStorage and refuses a callback whose state differs, which
 * is what binds a callback to the browser that started it (login CSRF).
 *
 * This module never touches the database, so its pure parts are unit-tested
 * without one (wcaOauth.test.ts).
 */

export type WcaMode = "signin" | "connect";

export type WcaStatePayload = {
  mode: WcaMode;
  /** the signed-in user who started a connect; absent for sign-in */
  uid?: string;
  /** 128 random bits, base64url: makes every state unique (replay guard) */
  nonce: string;
  /** epoch ms after which the state is refused */
  exp: number;
};

/** The verified identity we read from /api/v0/me. */
export type WcaMe = {
  /** the WCA's numeric account id: stable, present for every account */
  id: number;
  /** e.g. "2012PARK03"; null until the person's first competition */
  wcaId: string | null;
  name: string;
  /** small avatar; undefined when the account uses the default picture */
  avatarThumbUrl?: string;
  countryIso2?: string;
  /** only present when the "email" scope was granted */
  email?: string;
};

/** A WCA OAuth failure with a user-safe message and an HTTP status. */
export class WcaOauthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WcaOauthError";
    this.status = status;
  }
}

export const STATE_TTL_MS = 10 * 60 * 1000;
/** States minted further in the future than this are forged or clock-skewed. */
const STATE_MAX_FUTURE_MS = STATE_TTL_MS + 60 * 1000;
/** Domain separation: this HMAC key signs WCA states and nothing else. */
const STATE_CONTEXT = "cube-bench/wca-state/v1";

/** Sign-in asks for the email (to reach the person about their account);
 *  connecting an existing account only needs the public profile. */
export const SCOPES: Record<WcaMode, string> = {
  signin: "public email",
  connect: "public",
};

// ---------- configuration ----------

/** Overridable so tests can point the flow at a local mock of the WCA. */
export function wcaOauthBase(): string {
  const raw = (process.env.WCA_OAUTH_BASE ?? "").trim();
  return (raw || "https://www.worldcubeassociation.org").replace(/\/+$/, "");
}

/**
 * The public origin the WCA redirects back to. APP_URL wins; on Vercel the
 * production domain is a safe default; locally it's the Vite dev server.
 * Doorkeeper compares redirect_uri byte-for-byte with the registered one.
 */
export function appUrl(): string {
  const explicit = (process.env.APP_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:5173";
}

export type WcaConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  base: string;
};

/** null when WCA sign-in isn't configured on this server. */
export function wcaConfig(): WcaConfig | null {
  const clientId = (process.env.WCA_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.WCA_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl()}/auth/wca`,
    base: wcaOauthBase(),
  };
}

export function wcaAvailable(): boolean {
  return wcaConfig() !== null;
}

// ---------- state: sign, verify ----------

function hmac(secret: string, body: string): Buffer {
  return createHmac("sha256", secret).update(`${STATE_CONTEXT}.${body}`).digest();
}

export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function signState(payload: WcaStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(secret, body).toString("base64url")}`;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const NONCE_SHAPE = /^[A-Za-z0-9_-]{22}$/;
const UID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/** Narrow an untrusted parsed JSON value to a well-formed state payload. */
function asPayload(value: unknown): WcaStatePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  const allowed = new Set(["mode", "uid", "nonce", "exp"]);
  if (keys.some((k) => !allowed.has(k))) return null;
  if (v.mode !== "signin" && v.mode !== "connect") return null;
  if (typeof v.nonce !== "string" || !NONCE_SHAPE.test(v.nonce)) return null;
  if (typeof v.exp !== "number" || !Number.isSafeInteger(v.exp)) return null;
  if (v.mode === "connect") {
    if (typeof v.uid !== "string" || !UID_SHAPE.test(v.uid)) return null;
  } else if (v.uid !== undefined) {
    return null; // a sign-in state never names a user
  }
  return {
    mode: v.mode,
    nonce: v.nonce,
    exp: v.exp,
    ...(v.mode === "connect" ? { uid: v.uid as string } : {}),
  };
}

/**
 * The payload of a state we minted, or null if it is malformed, tampered
 * with, expired, or dated implausibly far ahead. The tag is checked (in
 * constant time) before the payload is parsed, so untrusted JSON is only
 * ever parsed after it is known to be ours.
 */
export function verifyState(
  state: string,
  secret: string,
  now: number = Date.now(),
): WcaStatePayload | null {
  if (typeof state !== "string" || state.length > 1024 || !secret) return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [body, tag] = parts as [string, string];
  if (!BASE64URL.test(body) || !BASE64URL.test(tag)) return null;
  // Compare the canonical encodings, not decoded bytes: base64url decoding
  // is lenient, and a state should have exactly one valid spelling.
  const expected = Buffer.from(hmac(secret, body).toString("base64url"));
  const given = Buffer.from(tag);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const payload = asPayload(parsed);
  if (!payload) return null;
  if (payload.exp <= now || payload.exp > now + STATE_MAX_FUTURE_MS) return null;
  return payload;
}

export function mintState(
  mode: WcaMode,
  uid: string | undefined,
  secret: string,
  now: number = Date.now(),
): { state: string; payload: WcaStatePayload } {
  const payload: WcaStatePayload = {
    mode,
    nonce: newNonce(),
    exp: now + STATE_TTL_MS,
    ...(mode === "connect" && uid ? { uid } : {}),
  };
  return { state: signState(payload, secret), payload };
}

export function buildAuthorizeUrl(
  config: Pick<WcaConfig, "base" | "clientId" | "redirectUri">,
  mode: WcaMode,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES[mode],
    state,
  });
  return `${config.base}/oauth/authorize?${params.toString()}`;
}

// ---------- replay guard ----------

/**
 * Nonces already redeemed on this instance, kept until their state would
 * have expired anyway. Per-instance by nature (serverless instances share no
 * memory); the WCA's single-use codes and the client-side state binding
 * cover the rest. Bounded so a flood of valid states can't grow memory.
 */
const NONCE_LEDGER_MAX = 10_000;
const redeemed = new Map<string, number>();

/** true the first time a nonce is redeemed, false on any replay. */
export function redeemNonce(nonce: string, exp: number, now: number = Date.now()): boolean {
  if (redeemed.has(nonce)) return false;
  for (const [n, e] of redeemed) {
    if (e > now && redeemed.size < NONCE_LEDGER_MAX) break;
    redeemed.delete(n); // expired (or over the bound): oldest first
  }
  redeemed.set(nonce, exp);
  return true;
}

// ---------- WCA HTTP calls ----------

const REQUEST_TIMEOUT_MS = 10_000;

const UNREACHABLE = "We couldn't reach the WCA right now. Please try again in a minute.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for failures where the request provably never reached the WCA, so
 *  even a non-idempotent call (the single-use code exchange) can be retried. */
function neverSent(err: unknown): boolean {
  const code = (err as { cause?: { code?: unknown } })?.cause?.code;
  return code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
}

/**
 * fetch with a per-attempt timeout and bounded backoff. `idempotent` decides
 * how far retries go: a GET is retried on timeouts, network errors, 429 and
 * 5xx; the code exchange only when the WCA is known not to have acted on it
 * (connection refused / DNS, 429, 502-504).
 */
async function wcaRequest(
  url: string,
  init: RequestInit,
  idempotent: boolean,
): Promise<Response> {
  const maxRetries = idempotent ? 2 : 1;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const transient = idempotent
        ? res.status === 429 || res.status >= 500
        : res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (transient && attempt < maxRetries) {
        await res.body?.cancel().catch(() => {});
        await sleep(250 * 2 ** attempt + Math.random() * 150);
        continue;
      }
      return res;
    } catch (err) {
      const retryable = idempotent || neverSent(err);
      if (retryable && attempt < maxRetries) {
        await sleep(250 * 2 ** attempt + Math.random() * 150);
        continue;
      }
      throw new WcaOauthError(UNREACHABLE, 502);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Trade a one-time authorization code for an access token. */
export async function exchangeCode(config: WcaConfig, code: string): Promise<string> {
  const res = await wcaRequest(
    `${config.base}/oauth/token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      }).toString(),
    },
    false,
  );
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok && typeof data?.access_token === "string" && data.access_token) {
    return data.access_token;
  }
  if (res.status === 400 || res.status === 401) {
    // invalid_grant: the code expired, was already used, or the
    // redirect_uri doesn't match. invalid_client: our credentials are wrong.
    if (data?.error === "invalid_client") {
      throw new WcaOauthError("WCA sign-in is misconfigured on this server.", 503);
    }
    throw new WcaOauthError(
      "That WCA sign-in link expired or was already used. Please try again.",
      400,
    );
  }
  throw new WcaOauthError(UNREACHABLE, 502);
}

const WCA_ID_SHAPE = /^\d{4}[A-Z]{4}\d{2}$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Narrow the untrusted /api/v0/me body to the fields we keep. */
export function parseMe(json: unknown): WcaMe | null {
  const me = (json as { me?: unknown } | null)?.me;
  if (!me || typeof me !== "object") return null;
  const m = me as Record<string, unknown>;
  if (typeof m.id !== "number" || !Number.isSafeInteger(m.id) || m.id <= 0) return null;
  const name = typeof m.name === "string" ? m.name.trim().slice(0, 80) : "";
  if (!name) return null;
  const rawId = typeof m.wca_id === "string" ? m.wca_id.trim().toUpperCase() : "";
  const avatar = (m.avatar ?? null) as { thumb_url?: unknown; url?: unknown } | null;
  const thumb = typeof avatar?.thumb_url === "string" ? avatar.thumb_url : "";
  const country = typeof m.country_iso2 === "string" ? m.country_iso2.toUpperCase() : "";
  const email = typeof m.email === "string" ? m.email.trim().toLowerCase() : "";
  return {
    id: m.id,
    wcaId: WCA_ID_SHAPE.test(rawId) ? rawId : null,
    name,
    // The WCA serves a stock picture for people without a photo; we'd rather
    // show their initials than a silhouette.
    avatarThumbUrl:
      /^https:\/\/\S+$/.test(thumb) && !thumb.includes("missing_avatar")
        ? thumb.slice(0, 500)
        : undefined,
    countryIso2: /^[A-Z]{2}$/.test(country) ? country : undefined,
    email: email && email.length <= 254 && EMAIL_SHAPE.test(email) ? email : undefined,
  };
}

/** Read the signed-in WCA account behind an access token. */
export async function fetchMe(config: WcaConfig, accessToken: string): Promise<WcaMe> {
  const res = await wcaRequest(
    `${config.base}/api/v0/me`,
    {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    },
    true,
  );
  if (res.status === 401 || res.status === 403) {
    throw new WcaOauthError("The WCA didn't accept this sign-in. Please try again.", 401);
  }
  if (!res.ok) throw new WcaOauthError(UNREACHABLE, 502);
  const me = parseMe(await res.json().catch(() => null));
  if (!me) throw new WcaOauthError("The WCA sent an account we couldn't read.", 502);
  return me;
}
