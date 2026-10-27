import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Translated } from "./dict/index.ts";

/**
 * A tiny in-repo i18n. English strings are used as the lookup keys, so any
 * string that hasn't been translated yet still renders in real English rather
 * than a blank or a raw key. Only fr/ko/es carry dictionaries; `en` is the
 * identity fallback (`t(key) = dict[key] ?? key`).
 *
 * No external library: just a context holding the current language, persisted
 * to localStorage, seeded from the browser's language on first visit.
 *
 * The translations live in ./dict and load on demand: English visitors never
 * download them, and a French/Korean/Spanish visitor's copy starts loading the
 * moment this module evaluates, in parallel with the rest of the app.
 */

export type Lang = "en" | "fr" | "ko" | "es";

const LANG_KEY = "cb_lang";
const VALID: readonly Lang[] = ["en", "fr", "ko", "es"];

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (VALID as readonly string[]).includes(v);
}

/** localStorage first, then the browser language prefix, then English. */
function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* storage may be unavailable (private mode); fall through to navigator */
  }
  const prefix = (navigator.language || "en").slice(0, 2).toLowerCase();
  if (prefix === "fr" || prefix === "ko" || prefix === "es") return prefix;
  return "en";
}

type I18nState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nState | null>(null);

type Dicts = Record<Translated, Record<string, string>>;
let dicts: Dicts | null = null;
let dictsPromise: Promise<Dicts> | null = null;

function loadDicts(): Promise<Dicts> {
  dictsPromise ??= import("./dict/index.ts").then((m) => (dicts = m.DICTS));
  return dictsPromise;
}

const initialLang = detectLang();
if (initialLang !== "en") void loadDicts();

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  // Bumped when the translations arrive, so `t` re-binds to them.
  const [ready, setReady] = useState(() => lang === "en" || dicts !== null);

  useEffect(() => {
    if (lang === "en" || dicts) {
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    loadDicts()
      .then(() => live && setReady(true))
      .catch(() => live && setReady(true)); // offline: fall back to English
    return () => {
      live = false;
    };
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* persistence is best-effort; the in-memory choice still applies */
    }
  }, []);

  const t = useCallback(
    (key: string): string =>
      lang === "en" ? key : (dicts?.[lang]?.[key] ?? key),
    // `ready` re-creates t once the dictionaries land
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, ready],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  // Hold the first paint for a non-English visitor until their translations
  // arrive (one small chunk, already in flight), rather than flashing English.
  if (!ready && dicts === null && lang === initialLang) return null;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside LanguageProvider");
  return ctx;
}
