import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { sql } from "./db.ts";
import {
  exchangeCode,
  fetchMe,
  mintState,
  buildAuthorizeUrl,
  redeemNonce,
  verifyState,
  wcaConfig,
  WcaOauthError,
  type WcaConfig,
  type WcaMe,
  type WcaMode,
} from "./wcaOauth.ts";

/**
 * Accounts and sessions.
 *
 * Three ways in:
 *   - google:<email> — verified via a Google Identity Services ID token
 *   - email:<email>  — email + password (scrypt-hashed, per-user salt)
 *   - wca:<wca id>   — the WCA's OAuth (numeric WCA account id, see wcaOauth.ts)
 *
 * Any account can also *connect* a WCA account, which stores the verified WCA
 * ID on its profile. Identities are never merged by email: a Google or email
 * account and a WCA sign-in with the same address stay separate accounts,
 * because an email match proves nothing about who controls either login.
 *
 * Users and sessions live in Postgres (Supabase), so they survive restarts and
 * deploys. Cube Bench is free: there are no plans, so nothing here gates
 * features. (Legacy billing columns on the users table are simply unused.)
 */

export type UserProfile = {
  displayName?: string;
  /** rough 3x3 average bucket, e.g. "sub-15" */
  avg333?: string;
  // ---- verified WCA identity (written only by the WCA OAuth flow) ----
  /** official WCA ID, e.g. "2012PARK03" (the simulator compares against it) */
  wcaId?: string;
  wcaName?: string;
  /** small avatar from the WCA, absent when they use the default picture */
  wcaAvatarUrl?: string;
  /** ISO 3166-1 alpha-2, e.g. "US" */
  wcaCountry?: string;
  /** epoch ms the identity was last verified with the WCA */
  wcaVerifiedAt?: number;
  /** the WCA's numeric account id, so a later "Continue with WCA" finds this
   *  account instead of creating a second one */
  wcaUserId?: number;
};

export type Provider = "google" | "email" | "wca";

export type User = {
  id: string;
  /** unique provider-scoped identity, e.g. "email:a@b.com" */
  key: string;
  provider: Provider;
  email: string;
  name: string;
  /** scrypt hash "salt:hash" — email accounts only */
  passwordHash?: string;
  createdAt: string;
  profile: UserProfile;
};

/** users.email is NOT NULL, but a WCA sign-in may not share an address. The
 *  .invalid TLD is reserved (RFC 2606), so this can never receive mail. */
const NO_EMAIL_DOMAIN = "@wca.invalid";

/** The shape we send to clients: never the password hash, and never the
 *  placeholder address (the client sees "" and can say "not shared"). */
export function publicUser(user: User) {
  const { passwordHash: _drop, ...rest } = user;
  return {
    ...rest,
    email: rest.email.endsWith(NO_EMAIL_DOMAIN) ? "" : rest.email,
  };
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export function googleAuthAvailable(): boolean {
  return googleClient !== null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

// ---------- password hashing (scrypt, built-in) ----------

/**
 * Async scrypt: the derivation runs on libuv's thread pool, so a burst of
 * sign-ins never blocks the event loop (scryptSync held it for ~50 ms each).
 * Parameters are Node's defaults (N=16384, r=8, p=1, 64-byte key), unchanged,
 * so every existing hash still verifies.
 */
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const got = await derive(password, salt);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Burn one derivation for unknown emails, so response time doesn't reveal
 *  whether an address has an account. */
async function equalizeTiming(password: string): Promise<void> {
  await derive(password, "0000000000000000").catch(() => {});
}

// ---------- user store (Postgres) ----------

/** Map a database row (snake_case) to the User shape (camelCase). */
type UserRow = {
  id: string;
  key: string;
  provider: Provider;
  email: string;
  name: string;
  password_hash?: string | null;
  created_at: Date | string;
  profile: UserProfile | null;
};

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    key: row.key,
    provider: row.provider,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash ?? undefined,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    profile: row.profile ?? {},
  };
}

async function findByKey(key: string): Promise<User | undefined> {
  const rows = await sql<UserRow[]>`
    select id, key, provider, email, name, password_hash, created_at, profile
    from users where key = ${key} limit 1
  `;
  return rows[0] ? rowToUser(rows[0]) : undefined;
}

async function insertUser(user: User): Promise<User> {
  await sql`
    insert into users (
      id, key, provider, email, name, password_hash, created_at, profile
    ) values (
      ${user.id}, ${user.key}, ${user.provider}, ${user.email}, ${user.name},
      ${user.passwordHash ?? null}, ${user.createdAt}, ${sql.json(user.profile)}
    )
  `;
  return user;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown })?.code === "23505";
}

/**
 * Merge a partial patch onto a user and persist. The profile merge happens in
 * SQL (jsonb ||), so two concurrent edits to different profile fields can't
 * overwrite each other the way a read-modify-write would.
 */
export async function patchUser(
  userId: string,
  patch: Partial<User>,
): Promise<User | undefined> {
  // Only mutable columns; id/key/provider/email/createdAt are immutable.
  const rows = await sql<UserRow[]>`
    update users set
      name = coalesce(${patch.name ?? null}, name),
      password_hash = coalesce(${patch.passwordHash ?? null}, password_hash),
      profile = profile || ${sql.json(patch.profile ?? {})}
    where id = ${userId}
    returning id, key, provider, email, name, password_hash, created_at, profile
  `;
  evictUser(userId);
  return rows[0] ? rowToUser(rows[0]) : undefined;
}

export async function updateProfile(
  userId: string,
  profile: UserProfile,
): Promise<User | undefined> {
  const patch: UserProfile = {};
  for (const k of Object.keys(profile) as (keyof UserProfile)[]) {
    if (profile[k] !== undefined) (patch as Record<string, unknown>)[k] = profile[k];
  }
  return patchUser(userId, { profile: patch });
}

export async function getUser(userId: string): Promise<User | undefined> {
  const rows = await sql<UserRow[]>`
    select id, key, provider, email, name, password_hash, created_at, profile
    from users where id = ${userId} limit 1
  `;
  return rows[0] ? rowToUser(rows[0]) : undefined;
}

// ---------- token → user cache ----------

/**
 * Authenticated requests come in bursts (cloud sync, leaderboards, profile
 * pages), and every instance has only a few database connections. Caching
 * the token's user for a minute turns a burst into one query.
 *
 * Bounded (oldest entry evicted first) and short-lived, and evicted
 * explicitly on sign-out and whenever this instance changes the user. Other
 * serverless instances may serve a changed profile or a signed-out token for
 * up to the TTL; nothing security-relevant hangs on that window beyond the
 * minute a sign-out takes to reach every instance.
 */
const USER_CACHE_TTL_MS = 60 * 1000;
const USER_CACHE_MAX = 5_000;
type CachedUser = { user: User; expiresAt: number };
const userCache = new Map<string, CachedUser>();

/** A copy, so a caller mutating its user can't corrupt the cache. */
function cloneUser(user: User): User {
  return { ...user, profile: { ...user.profile } };
}

function cacheGet(token: string, now: number): User | undefined {
  const hit = userCache.get(token);
  if (!hit) return undefined;
  if (hit.expiresAt <= now) {
    userCache.delete(token);
    return undefined;
  }
  return cloneUser(hit.user);
}

function cachePut(token: string, user: User, sessionExpiresAt: number, now: number): void {
  if (userCache.has(token)) userCache.delete(token);
  else if (userCache.size >= USER_CACHE_MAX) {
    const oldest = userCache.keys().next().value;
    if (oldest !== undefined) userCache.delete(oldest);
  }
  userCache.set(token, {
    user: cloneUser(user),
    expiresAt: Math.min(now + USER_CACHE_TTL_MS, sessionExpiresAt),
  });
}

/**
 * Forget every cached session of one user. Called by anything here that
 * changes a user; other modules that write users.profile directly must call
 * it too, or requests on this instance see the old profile for up to a minute.
 */
export function evictUser(userId: string): void {
  for (const [token, entry] of userCache) {
    if (entry.user.id === userId) userCache.delete(token);
  }
}

// ---------- sessions (Postgres, TTL'd) ----------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await sql`
    insert into sessions (token, user_id, expires_at)
    values (${token}, ${userId}, ${expiresAt})
  `;
  return token;
}

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

/**
 * The user behind a session token, or undefined. One indexed join that
 * ignores expired sessions (the sweep below deletes them later), fronted by
 * the cache above. Malformed tokens never reach the database.
 */
export async function userForToken(token: string): Promise<User | undefined> {
  if (!token || !TOKEN_SHAPE.test(token)) return undefined;
  const now = Date.now();
  const cached = cacheGet(token, now);
  if (cached) return cached;
  const rows = await sql<(UserRow & { expires_at: string | number })[]>`
    select u.id, u.key, u.provider, u.email, u.name, u.created_at, u.profile,
           s.expires_at
    from sessions s
    join users u on u.id = s.user_id
    where s.token = ${token} and s.expires_at > ${now}
    limit 1
  `;
  const row = rows[0];
  if (!row) return undefined;
  const user = rowToUser(row);
  cachePut(token, user, Number(row.expires_at), now);
  return user;
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  userCache.delete(token);
  if (!TOKEN_SHAPE.test(token)) return;
  await sql`delete from sessions where token = ${token}`;
}

/**
 * Expired sessions are invisible (userForToken filters them) but still take
 * space. Sign-in is a natural, low-frequency moment to tidy up: at most once
 * an hour per instance, delete one bounded batch, using the expires_at index.
 * Best effort: a failed sweep never fails a sign-in.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const SWEEP_BATCH = 500;
let lastSweepAt = 0;

async function sweepExpiredSessions(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    await sql`
      delete from sessions where token in (
        select token from sessions where expires_at <= ${now} limit ${SWEEP_BATCH}
      )
    `;
  } catch (err) {
    console.error(`[sessions] sweep failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function issue(user: User): Promise<{ user: User; token: string }> {
  await sweepExpiredSessions();
  return { user, token: await createSession(user.id) };
}

// ---------- Google ----------

export async function signInWithGoogle(
  credential: string,
): Promise<{ user: User; token: string }> {
  if (!googleClient) {
    throw new AuthError(
      "Google sign-in isn't configured on this server (GOOGLE_CLIENT_ID is not set).",
      503,
    );
  }
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AuthError("Google sign-in could not be verified.", 401);
  }
  if (!payload?.email) {
    throw new AuthError("Google account has no email we can use.", 401);
  }
  const email = payload.email.toLowerCase();
  const existing = await findByKey(`google:${email}`);
  if (existing) return issue(existing);
  const user = await insertUser({
    id: randomBytes(12).toString("hex"),
    key: `google:${email}`,
    provider: "google",
    email,
    name: payload.name ?? email.split("@")[0],
    createdAt: new Date().toISOString(),
    profile: {},
  });
  return issue(user);
}

// ---------- Email + password ----------

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function signUpWithEmail(
  emailRaw: string,
  password: string,
  nameRaw: string,
): Promise<{ user: User; token: string }> {
  const email = normalizeEmail(emailRaw);
  const name = nameRaw.trim();
  if (!email || email.length > 254 || !EMAIL_SHAPE.test(email)) {
    throw new AuthError("Please enter a valid email address.", 400);
  }
  if (!name || name.length > 80) {
    throw new AuthError("Please enter a name (up to 80 characters).", 400);
  }
  if (password.length < 8 || password.length > 200) {
    throw new AuthError("Password must be at least 8 characters.", 400);
  }
  if (await findByKey(`email:${email}`)) {
    throw new AuthError("An account with that email already exists. Sign in instead.", 409);
  }
  try {
    const user = await insertUser({
      id: randomBytes(12).toString("hex"),
      key: `email:${email}`,
      provider: "email",
      email,
      name,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
      profile: {},
    });
    return issue(user);
  } catch (err) {
    // Two sign-ups for one address racing past the check above.
    if (isUniqueViolation(err)) {
      throw new AuthError("An account with that email already exists. Sign in instead.", 409);
    }
    throw err;
  }
}

export async function signInWithEmail(
  emailRaw: string,
  password: string,
): Promise<{ user: User; token: string }> {
  const email = normalizeEmail(emailRaw);
  const user = email && password ? await findByKey(`email:${email}`) : undefined;
  // Same error (and roughly the same time) whether the email is unknown or
  // the password is wrong, so we don't reveal which emails have accounts.
  if (!user || !user.passwordHash) {
    if (password) await equalizeTiming(password);
    throw new AuthError("Wrong email or password.", 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Wrong email or password.", 401);
  }
  return issue(user);
}

// ---------- WCA (OAuth 2) ----------

function requireWcaConfig(): WcaConfig {
  const config = wcaConfig();
  if (!config) {
    throw new AuthError(
      "WCA sign-in isn't configured on this server (WCA_CLIENT_ID / WCA_CLIENT_SECRET are not set).",
      503,
    );
  }
  return config;
}

/** The authorize URL to send the browser to, plus the state it carries (the
 *  client keeps it to check the callback came from its own request). */
export function startWcaFlow(
  mode: WcaMode,
  userId?: string,
): { url: string; state: string } {
  const config = requireWcaConfig();
  const { state } = mintState(mode, userId, config.clientSecret);
  return { url: buildAuthorizeUrl(config, mode, state), state };
}

export type WcaFinish =
  | { mode: "signin"; user: User; token: string; created: boolean }
  | { mode: "connect"; user: User };

const NO_WCA_ID =
  "This WCA account has no WCA ID yet. It appears after your first competition.";
const WCA_ID_TAKEN = "This WCA ID is already connected to another Cube Bench account.";

/** The profile fields a verified WCA identity writes. */
function wcaFields(me: WcaMe & { wcaId: string }): UserProfile {
  return {
    wcaId: me.wcaId,
    wcaName: me.name,
    ...(me.avatarThumbUrl ? { wcaAvatarUrl: me.avatarThumbUrl } : {}),
    ...(me.countryIso2 ? { wcaCountry: me.countryIso2 } : {}),
    wcaVerifiedAt: Date.now(),
    wcaUserId: me.id,
  };
}

/**
 * Store a verified WCA identity on a user, replacing any previous one (so a
 * removed avatar doesn't linger). Atomic and conflict-aware: the update only
 * applies when no *other* user holds the same WCA ID, so one WCA ID maps to
 * one Cube Bench account. Returns undefined on a conflict.
 */
async function storeWcaIdentity(
  userId: string,
  me: WcaMe & { wcaId: string },
): Promise<User | undefined> {
  try {
    const rows = await sql<UserRow[]>`
      update users set profile =
        (profile - 'wcaId' - 'wcaName' - 'wcaAvatarUrl' - 'wcaCountry'
                 - 'wcaVerifiedAt' - 'wcaUserId')
        || ${sql.json(wcaFields(me))}
      where id = ${userId}
        and not exists (
          select 1 from users other
          where other.profile->>'wcaId' = ${me.wcaId} and other.id <> ${userId}
        )
      returning id, key, provider, email, name, created_at, profile
    `;
    evictUser(userId);
    return rows[0] ? rowToUser(rows[0]) : undefined;
  } catch (err) {
    if (isUniqueViolation(err)) return undefined; // a unique index on wcaId, if present
    throw err;
  }
}

/** An account that already connected this WCA account (or holds its ID). */
async function findLinkedWcaUser(me: WcaMe): Promise<User | undefined> {
  const rows = me.wcaId
    ? await sql<UserRow[]>`
        select id, key, provider, email, name, created_at, profile from users
        where profile->>'wcaUserId' = ${String(me.id)} or profile->>'wcaId' = ${me.wcaId}
        limit 1
      `
    : await sql<UserRow[]>`
        select id, key, provider, email, name, created_at, profile from users
        where profile->>'wcaUserId' = ${String(me.id)}
        limit 1
      `;
  return rows[0] ? rowToUser(rows[0]) : undefined;
}

function hasWcaId(me: WcaMe): me is WcaMe & { wcaId: string } {
  return typeof me.wcaId === "string";
}

/**
 * "Continue with WCA". The account is the one created by an earlier WCA
 * sign-in, else the one that connected this WCA account in Settings (the
 * person proved control of both, so that is a deliberate link, not an email
 * guess), else a new account. Each sign-in refreshes the verified fields.
 */
async function signInWithWca(me: WcaMe): Promise<WcaFinish> {
  const key = `wca:${me.id}`;
  const existing = (await findByKey(key)) ?? (await findLinkedWcaUser(me));
  if (existing) {
    // A conflict here (another account holds the ID) just skips the refresh:
    // it must never stop someone signing in to their own account.
    const refreshed = hasWcaId(me) ? await storeWcaIdentity(existing.id, me) : undefined;
    const user = refreshed ?? existing;
    return { mode: "signin", ...(await issue(user)), created: false };
  }
  try {
    const user = await insertUser({
      id: randomBytes(12).toString("hex"),
      key,
      provider: "wca",
      email: me.email ?? `${me.id}${NO_EMAIL_DOMAIN}`,
      name: me.name,
      createdAt: new Date().toISOString(),
      profile: hasWcaId(me) ? wcaFields(me) : {},
    });
    return { mode: "signin", ...(await issue(user)), created: true };
  } catch (err) {
    // A double-submitted callback racing its twin: use the row it created.
    const raced = isUniqueViolation(err) ? await findByKey(key) : undefined;
    if (!raced) throw err;
    return { mode: "signin", ...(await issue(raced)), created: false };
  }
}

/** Settings → "Connect WCA account" for a signed-in user. */
async function connectWca(user: User, me: WcaMe): Promise<WcaFinish> {
  if (!hasWcaId(me)) throw new AuthError(NO_WCA_ID, 400);
  if (user.provider === "wca" && user.key !== `wca:${me.id}`) {
    throw new AuthError("This account signs in with a different WCA account.", 409);
  }
  const updated = await storeWcaIdentity(user.id, me);
  if (!updated) throw new AuthError(WCA_ID_TAKEN, 409);
  return { mode: "connect", user: updated };
}

/**
 * Complete the OAuth callback: check the state, trade the code server-side,
 * read the WCA profile, then sign in or connect. A connect must come from the
 * same signed-in user who started it (the state names them).
 */
export async function finishWcaFlow(
  code: string,
  state: string,
  bearer: string,
): Promise<WcaFinish> {
  const config = requireWcaConfig();
  if (!code || code.length > 512) {
    throw new AuthError("The WCA didn't send a sign-in code. Please try again.", 400);
  }
  const payload = verifyState(state, config.clientSecret);
  if (!payload) {
    throw new AuthError("This WCA sign-in expired. Please start again.", 400);
  }
  let connecting: User | undefined;
  if (payload.mode === "connect") {
    connecting = await userForToken(bearer);
    if (!connecting) {
      throw new AuthError("Please sign in again to connect your WCA account.", 401);
    }
    if (connecting.id !== payload.uid) {
      throw new AuthError("This WCA connection was started from a different account.", 403);
    }
  }
  if (!redeemNonce(payload.nonce, payload.exp)) {
    throw new AuthError("This WCA sign-in was already used. Please start again.", 400);
  }
  let me: WcaMe;
  try {
    me = await fetchMe(config, await exchangeCode(config, code));
  } catch (err) {
    if (err instanceof WcaOauthError) throw new AuthError(err.message, err.status);
    throw err;
  }
  return connecting ? connectWca(connecting, me) : signInWithWca(me);
}

/** Remove the verified WCA identity from an account. */
export async function disconnectWca(user: User): Promise<User> {
  if (user.provider === "wca") {
    throw new AuthError("This account signs in with WCA, so its WCA ID stays connected.", 400);
  }
  const rows = await sql<UserRow[]>`
    update users set profile =
      profile - 'wcaId' - 'wcaName' - 'wcaAvatarUrl' - 'wcaCountry'
              - 'wcaVerifiedAt' - 'wcaUserId'
    where id = ${user.id}
    returning id, key, provider, email, name, created_at, profile
  `;
  evictUser(user.id);
  if (!rows[0]) throw new AuthError("Not signed in.", 401);
  return rowToUser(rows[0]);
}
