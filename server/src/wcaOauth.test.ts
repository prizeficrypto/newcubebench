/**
 * WCA OAuth state + profile parsing tests. Run: node server/src/wcaOauth.test.ts
 * (Node strips the types natively; no test runner or database needed.)
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildAuthorizeUrl,
  mintState,
  parseMe,
  redeemNonce,
  SCOPES,
  signState,
  STATE_TTL_MS,
  verifyState,
  type WcaStatePayload,
} from "./wcaOauth.ts";

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok - ${name}`);
}

const SECRET = "test-secret-0123456789";
const NOW = 1_800_000_000_000;
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA"; // 22 base64url chars = 128 bits

/** Re-sign an arbitrary body with the real key layout, to prove the payload
 *  checks hold even for correctly signed garbage. */
function forge(body: unknown): string {
  const b = Buffer.from(JSON.stringify(body)).toString("base64url");
  const tag = createHmac("sha256", SECRET)
    .update(`cube-bench/wca-state/v1.${b}`)
    .digest("base64url");
  return `${b}.${tag}`;
}

test("a minted sign-in state verifies and round-trips", () => {
  const { state, payload } = mintState("signin", undefined, SECRET, NOW);
  assert.deepEqual(verifyState(state, SECRET, NOW + 1000), payload);
  assert.equal(payload.mode, "signin");
  assert.equal(payload.uid, undefined);
  assert.equal(payload.exp, NOW + STATE_TTL_MS);
  assert.match(payload.nonce, /^[A-Za-z0-9_-]{22}$/);
});

test("a connect state carries the user id", () => {
  const { state } = mintState("connect", "abc123def456abc123def456", SECRET, NOW);
  const back = verifyState(state, SECRET, NOW);
  assert.equal(back?.mode, "connect");
  assert.equal(back?.uid, "abc123def456abc123def456");
});

test("every state is unique (fresh nonce)", () => {
  const a = mintState("signin", undefined, SECRET, NOW).state;
  const b = mintState("signin", undefined, SECRET, NOW).state;
  assert.notEqual(a, b);
});

test("expired and far-future states are refused", () => {
  const { state } = mintState("signin", undefined, SECRET, NOW);
  assert.equal(verifyState(state, SECRET, NOW + STATE_TTL_MS), null);
  assert.equal(verifyState(state, SECRET, NOW + STATE_TTL_MS + 1), null);
  const future = signState({ mode: "signin", nonce: NONCE, exp: NOW + 24 * 3600e3 }, SECRET);
  assert.equal(verifyState(future, SECRET, NOW), null);
});

test("a different secret, tampered payload or tampered tag is refused", () => {
  const { state } = mintState("connect", "user1", SECRET, NOW);
  assert.equal(verifyState(state, "another-secret", NOW), null);
  const [body, tag] = state.split(".") as [string, string];
  const evil = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), uid: "user2" }),
  ).toString("base64url");
  assert.equal(verifyState(`${evil}.${tag}`, SECRET, NOW), null);
  const flipped = tag.slice(0, -2) + (tag.at(-2) === "A" ? "B" : "A") + tag.at(-1);
  assert.equal(verifyState(`${body}.${flipped}`, SECRET, NOW), null);
});

test("non-canonical tag spellings are refused", () => {
  const { state } = mintState("signin", undefined, SECRET, NOW);
  assert.equal(verifyState(`${state}=`, SECRET, NOW), null);
  assert.equal(verifyState(`${state}A`, SECRET, NOW), null);
});

test("malformed strings never throw", () => {
  for (const s of ["", ".", "a.b.c", "!!!.???", "abc", "a".repeat(2000), "e30.e30"]) {
    assert.equal(verifyState(s, SECRET, NOW), null, s);
  }
  assert.equal(verifyState(mintState("signin", undefined, SECRET, NOW).state, "", NOW), null);
});

test("correctly signed but ill-shaped payloads are refused", () => {
  const ok: WcaStatePayload = { mode: "signin", nonce: NONCE, exp: NOW + 1000 };
  assert.deepEqual(verifyState(forge(ok), SECRET, NOW), ok);
  const bad: unknown[] = [
    null,
    [],
    "x",
    { ...ok, mode: "admin" },
    { ...ok, nonce: "short" },
    { ...ok, exp: "soon" },
    { ...ok, exp: 1.5 },
    { ...ok, uid: "u1" }, // sign-in never names a user
    { ...ok, extra: true },
    { mode: "connect", nonce: NONCE, exp: NOW + 1000 }, // connect without uid
    { mode: "connect", nonce: NONCE, exp: NOW + 1000, uid: "has space" },
  ];
  for (const b of bad) assert.equal(verifyState(forge(b), SECRET, NOW), null, JSON.stringify(b));
});

test("a nonce is redeemable once", () => {
  const nonce = "BBBBBBBBBBBBBBBBBBBBBB";
  assert.equal(redeemNonce(nonce, NOW + 1000, NOW), true);
  assert.equal(redeemNonce(nonce, NOW + 1000, NOW), false);
  assert.equal(redeemNonce("CCCCCCCCCCCCCCCCCCCCCC", NOW + 1000, NOW), true);
});

test("authorize URL carries the exact redirect, scope and state", () => {
  const url = new URL(
    buildAuthorizeUrl(
      {
        base: "https://www.worldcubeassociation.org",
        clientId: "cid",
        redirectUri: "https://cube.example/auth/wca",
      },
      "signin",
      "s.t",
    ),
  );
  assert.equal(url.origin + url.pathname, "https://www.worldcubeassociation.org/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "https://cube.example/auth/wca");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), SCOPES.signin);
  assert.equal(url.searchParams.get("state"), "s.t");
  assert.equal(SCOPES.connect, "public");
});

test("parseMe keeps verified fields and drops junk", () => {
  const me = parseMe({
    me: {
      id: 6,
      wca_id: "2012park03",
      name: "  Max Park ",
      avatar: { url: "https://x/a.jpg", thumb_url: "https://x/a_thumb.jpg" },
      country_iso2: "us",
      email: "Max@Example.com",
    },
  });
  assert.deepEqual(me, {
    id: 6,
    wcaId: "2012PARK03",
    name: "Max Park",
    avatarThumbUrl: "https://x/a_thumb.jpg",
    countryIso2: "US",
    email: "max@example.com",
  });
});

test("parseMe: no WCA ID yet, stock avatar, no email", () => {
  const me = parseMe({
    me: {
      id: 42,
      wca_id: null,
      name: "New Cuber",
      avatar: { thumb_url: "https://www.worldcubeassociation.org/assets/missing_avatar_thumb-1.png" },
    },
  });
  assert.equal(me?.wcaId, null);
  assert.equal(me?.avatarThumbUrl, undefined);
  assert.equal(me?.email, undefined);
  assert.equal(me?.countryIso2, undefined);
});

test("parseMe refuses bodies without an id or name", () => {
  assert.equal(parseMe(null), null);
  assert.equal(parseMe({}), null);
  assert.equal(parseMe({ me: { id: "6", name: "x" } }), null);
  assert.equal(parseMe({ me: { id: 6, name: "  " } }), null);
  assert.equal(parseMe({ me: { id: -1, name: "x" } }), null);
  assert.equal(parseMe({ me: { id: 6, name: "x", wca_id: "nope", avatar: { thumb_url: "javascript:alert(1)" } } })?.avatarThumbUrl, undefined);
});

console.log(`\n${n} tests passed`);
