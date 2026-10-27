import { store } from "./store.ts";

/**
 * Client for the social endpoints (profiles, follows, friends board, round
 * leaderboards, shared results). Every call carries the session token when
 * there is one. A server without the social tables answers 503
 * "social_unavailable": callers get a SocialUnavailable and hide the feature.
 */
export class SocialUnavailable extends Error {}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = store.get("cb_token");
  const res = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && data?.code === "social_unavailable") throw new SocialUnavailable();
  if (!res.ok) {
    const err = new Error(typeof data?.error === "string" ? data.error : "Something went wrong.") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export type MyProfile = { handle: string; isPublic: boolean; bio: string };
export type Pb = { event: string; single: number | null; ao5: number | null; ao12: number | null; count: number };
export type PublicProfile = {
  handle: string;
  displayName: string;
  bio: string;
  wcaId: string | null;
  memberSince: string;
  followers: number;
  following: number;
  pbs: Pb[];
  results: {
    id: string;
    compName: string;
    eventId: string;
    roundTypeId: string;
    averageCs: number | null;
    placement: number | null;
    fieldSize: number | null;
    at: string;
  }[];
  isMe: boolean;
  followedByMe: boolean;
};
export type FriendRow = {
  handle: string | null;
  displayName: string;
  isMe: boolean;
  single: number | null;
  ao5: number | null;
  ao12: number | null;
  count: number;
};
export type Board = {
  count: number;
  top: { handle: string; displayName: string; averageCs: number | null; bestCs: number | null }[];
  you: { averageCs: number | null; bestCs: number | null; rank: number } | null;
};
export type SharedResult = {
  compId: string;
  compName: string;
  eventId: string;
  roundTypeId: string;
  groupId: string | null;
  attempts: { rawMs: number; plus2: boolean; dnf: boolean }[];
  averageCs: number | null;
  placement: number | null;
  fieldSize: number | null;
  at: string;
  handle: string | null;
  displayName: string | null;
};

export const socialApi = {
  me: () => call<{ profile: MyProfile | null }>("GET", "/api/social/me"),
  saveProfile: (p: MyProfile) => call<{ profile: MyProfile }>("PUT", "/api/social/profile", p),
  handleAvailable: (h: string) =>
    call<{ available: boolean; reason?: string }>("GET", `/api/social/handles/${encodeURIComponent(h)}`),
  profile: (handle: string) => call<PublicProfile>("GET", `/api/u/${encodeURIComponent(handle)}`),
  follow: (handle: string) => call("POST", `/api/follows/${encodeURIComponent(handle)}`),
  unfollow: (handle: string) => call("DELETE", `/api/follows/${encodeURIComponent(handle)}`),
  friends: (event: string) =>
    call<{ event: string; people: FriendRow[] }>("GET", `/api/friends?event=${encodeURIComponent(event)}`),
  search: (q: string) =>
    call<{ people: { handle: string; displayName: string }[] }>("GET", `/api/social/search?q=${encodeURIComponent(q)}`),
  saveResult: (body: unknown) => call<{ id: string; attemptNo: number }>("POST", "/api/sim-results", body),
  board: (compId: string, eventId: string, roundTypeId: string) =>
    call<Board>(
      "GET",
      `/api/competitions/${encodeURIComponent(compId)}/board?event=${encodeURIComponent(eventId)}&roundTypeId=${encodeURIComponent(roundTypeId)}`,
    ),
  result: (id: string) => call<SharedResult>("GET", `/api/sim-results/${encodeURIComponent(id)}`),
};
