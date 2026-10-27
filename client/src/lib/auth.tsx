import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { store } from "./store.ts";

/**
 * Session state for the app. The token lives in localStorage; the user is
 * re-fetched from /api/me on load so a stale token signs out cleanly instead
 * of pretending. Google sign-in sends Google's ID token to the backend for
 * real verification; email accounts are passwordless by design in this MVP.
 */

export type User = {
  id: string;
  provider: "google" | "email" | "wca";
  email: string;
  name: string;
  profile: {
    displayName?: string;
    avg333?: string;
    /** verified through WCA sign-in; never typed by the user */
    wcaId?: string;
    wcaName?: string;
    wcaAvatarUrl?: string;
    wcaCountry?: string;
    wcaVerifiedAt?: number;
  };
};

/** sessionStorage key: where to return after the WCA round trip. */
export const WCA_RETURN_KEY = "cb_wca_return";

const TOKEN_KEY = "cb_token";

type AuthState = {
  user: User | null;
  /** true until the stored token has been checked against the server */
  loading: boolean;
  googleAvailable: boolean;
  wcaAvailable: boolean;
  /** leave for the WCA to sign in, or to connect the signed-in account */
  startWca: (mode: "signin" | "connect") => Promise<void>;
  /** finish the WCA round trip; returns the mode and whether a new account was made */
  finishWca: (code: string, state: string) => Promise<{ mode: "signin" | "connect"; created?: boolean }>;
  disconnectWca: () => Promise<void>;
  signInGoogle: (credential: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  saveProfile: (profile: { displayName?: string; avg333?: string }) => Promise<void>;
  /** refresh the current user from the server */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Something went wrong.",
    );
  }
  return data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [wcaAvailable, setWcaAvailable] = useState(false);

  // Restore session + discover which sign-in methods the server supports.
  // The two requests run in parallel; nothing in the app waits on the config.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cancelled) return;
        setGoogleAvailable(Boolean(cfg?.googleAvailable));
        setWcaAvailable(Boolean(cfg?.wcaAvailable));
      })
      .catch(() => {
        /* config is advisory; email auth still works */
      });
    (async () => {
      const token = store.get(TOKEN_KEY);
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setUser(data.user);
        } else {
          store.remove(TOKEN_KEY); // stale token: sign out honestly
        }
      } catch {
        /* offline: leave signed out; a retry happens on next load */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishSignIn = useCallback((data: { user: User; token: string }) => {
    store.set(TOKEN_KEY, data.token);
    setUser(data.user);
  }, []);

  const signInGoogle = useCallback(
    async (credential: string) => {
      finishSignIn(
        await postJson<{ user: User; token: string }>("/api/auth/google", {
          credential,
        }),
      );
    },
    [finishSignIn],
  );

  const signUpEmail = useCallback(
    async (email: string, password: string, name: string) => {
      finishSignIn(
        await postJson<{ user: User; token: string }>("/api/auth/signup", {
          email,
          password,
          name,
        }),
      );
    },
    [finishSignIn],
  );

  const signInEmail = useCallback(
    async (email: string, password: string) => {
      finishSignIn(
        await postJson<{ user: User; token: string }>("/api/auth/signin", {
          email,
          password,
        }),
      );
    },
    [finishSignIn],
  );

  const refresh = useCallback(async () => {
    const token = store.get(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUser((await res.json()).user);
    } catch {
      /* leave current state on a transient failure */
    }
  }, []);

  const saveProfile = useCallback(
    async (profile: { displayName?: string; avg333?: string }) => {
      const token = store.get(TOKEN_KEY) ?? "";
      const data = await postJson<{ user: User }>("/api/profile", profile, token);
      setUser(data.user);
    },
    [],
  );

  const startWca = useCallback(async (mode: "signin" | "connect") => {
    const token = store.get(TOKEN_KEY) ?? undefined;
    const { url } = await postJson<{ url: string }>("/api/auth/wca/start", { mode }, token);
    try {
      sessionStorage.setItem(WCA_RETURN_KEY, mode === "connect" ? "/app/settings" : "/");
    } catch {
      /* the default return target is fine */
    }
    window.location.assign(url);
  }, []);

  const finishWca = useCallback(async (code: string, state: string) => {
    const token = store.get(TOKEN_KEY) ?? undefined;
    const data = await postJson<{
      mode: "signin" | "connect";
      user: User;
      token?: string;
      created?: boolean;
    }>("/api/auth/wca/finish", { code, state }, token);
    if (data.token) store.set(TOKEN_KEY, data.token);
    setUser(data.user);
    return { mode: data.mode, created: data.created };
  }, []);

  const disconnectWca = useCallback(async () => {
    const token = store.get(TOKEN_KEY) ?? "";
    const data = await postJson<{ user: User }>("/api/auth/wca/disconnect", {}, token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    const token = store.get(TOKEN_KEY);
    store.remove(TOKEN_KEY);
    setUser(null);
    if (token) {
      try {
        await postJson("/api/auth/signout", {}, token);
      } catch {
        /* local sign-out already done; server session expires with restart */
      }
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        googleAvailable,
        wcaAvailable,
        startWca,
        finishWca,
        disconnectWca,
        signInGoogle,
        signUpEmail,
        signInEmail,
        saveProfile,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
