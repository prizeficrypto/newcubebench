import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getEvents,
  getHighlight,
  searchCompetitions,
  type Competition,
  type EventMeta,
} from "../lib/api.ts";
import { FEATURED_COMPS, FEATURED_COMP_IDS } from "../lib/featured.ts";

/** Best-effort highlight for a featured comp, keyed by comp id. */
type Highlight = {
  countryIso2?: string;
  winnerName: string | null;
  eventCount: number;
};
import { isTouchDevice } from "../lib/pointer.ts";
import { useAuth } from "../lib/auth.tsx";
import { useT } from "../lib/i18n.tsx";

/**
 * Competition picker with visual free/Pro gating (no accounts in this
 * version). With an empty search, the three featured (free) competitions are
 * shown. Searching reveals the whole library; non-featured comps render
 * locked and link to Pricing instead of starting a session.
 *
 * Selecting a free comp fetches the events it held that can be simulated;
 * comps whose scrambles were never uploaded show "Scrambles not available"
 * and can't be started.
 */
export function CompetitionPicker({
  onProceed,
}: {
  onProceed: (comp: Competition, events: EventMeta[]) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const isPro = Boolean(user?.pro);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [year, setYear] = useState("");
  const [results, setResults] = useState<Competition[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<Record<string, string>>({});
  const [retryNonce, setRetryNonce] = useState(0);

  // A monotonic token identifies the "current" filter set. Any fetch stamps
  // its token; when it returns we drop the result unless the token still
  // matches — this guards against slow WCA responses arriving out of order.
  const requestToken = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Best-effort highlights for the featured info cards. Fetched once on mount,
  // in parallel; a failure just leaves that card without winner/events.
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [highlightsDone, setHighlightsDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      FEATURED_COMPS.map((c) => getHighlight(c.id)),
    ).then((settled) => {
      if (cancelled) return;
      const next: Record<string, Highlight> = {};
      settled.forEach((res, i) => {
        if (res.status === "fulfilled") {
          next[FEATURED_COMPS[i].id] = {
            countryIso2: res.value.competition.country_iso2,
            winnerName: res.value.winnerName,
            eventCount: res.value.eventCount,
          };
        }
      });
      setHighlights(next);
      setHighlightsDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Guests never browse — the effect below is only meaningful when signed in.
  const canBrowse = Boolean(user);

  // Turn the chosen filters into the backend's query shape.
  function buildOpts(pageNum: number) {
    return {
      q: query.trim() || undefined,
      country: country || undefined,
      start: year ? `${year}-01-01` : undefined,
      end: year ? `${year}-12-31` : undefined,
      page: pageNum,
    };
  }

  // Page 1 loads on mount and whenever a filter changes; the text query is
  // debounced so typing doesn't fire a request per keystroke. Any change
  // resets the accumulated results and bumps the request token so a slow
  // earlier fetch can't clobber the fresh list.
  useEffect(() => {
    if (!canBrowse) return;
    const token = ++requestToken.current;
    setResults([]);
    setPage(1);
    setHasMore(false);
    setError(null);
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await searchCompetitions(buildOpts(1));
        if (requestToken.current !== token) return;
        setResults(res.competitions);
        setHasMore(res.hasMore);
      } catch (err) {
        if (requestToken.current !== token) return;
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (requestToken.current === token) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, country, year, canBrowse, retryNonce]);

  // Fetch and append the next page. Guarded so it never runs while a request
  // is in flight, and stamped with the current token so a stale next-page
  // fetch is discarded if the filters changed underneath it.
  async function loadMore() {
    if (loading || !hasMore) return;
    const token = requestToken.current;
    const next = page + 1;
    setLoading(true);
    try {
      const res = await searchCompetitions(buildOpts(next));
      if (requestToken.current !== token) return;
      setResults((prev) => [...prev, ...res.competitions]);
      setPage(next);
      setHasMore(res.hasMore);
    } catch (err) {
      if (requestToken.current !== token) return;
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      if (requestToken.current === token) setLoading(false);
    }
  }

  // Infinite scroll: when the sentinel at the bottom of the list scrolls into
  // view and there's another page, pull it in.
  useEffect(() => {
    if (!canBrowse) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBrowse, hasMore, loading, page]);

  // Focus the search on desktop only — on phones autofocus throws the
  // keyboard over the featured list, which is the intended first tap.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isTouchDevice()) inputRef.current?.focus();
  }, []);

  async function select(comp: Competition) {
    if (selectingId || unavailable[comp.id]) return;
    if (!FEATURED_COMP_IDS.has(comp.id)) {
      // The full library is beyond the featured free comps: guests sign up
      // first, signed-in free users see the Pro upgrade.
      if (!user) {
        navigate("/join");
        return;
      }
      if (!isPro) {
        navigate("/app/pricing");
        return;
      }
    }
    setSelectingId(comp.id);
    try {
      const { events } = await getEvents(comp.id);
      if (events.length > 0) {
        onProceed(comp, events);
      } else {
        setUnavailable((u) => ({
          ...u,
          [comp.id]: "Scrambles not available",
        }));
      }
    } catch (err) {
      setUnavailable((u) => ({
        ...u,
        [comp.id]: err instanceof Error ? err.message : "Could not load events",
      }));
    } finally {
      setSelectingId(null);
    }
  }

  const featuredCards = (
    <div className="picker__cards">
      {FEATURED_COMPS.map((comp) => {
        const note = unavailable[comp.id];
        const busy = selectingId === comp.id;
        const hl = highlights[comp.id];
        const loading = !highlightsDone && !hl;
        const location = [comp.city, countryName(hl?.countryIso2)]
          .filter(Boolean)
          .join(", ");
        return (
          <button
            key={comp.id}
            className={`comp-card${note ? " is-unavailable" : ""}`}
            onClick={() => select(comp)}
            disabled={!!note || !!selectingId}
            aria-label={comp.name}
          >
            <span className="comp-card__top">
              <span className="comp-card__name">{comp.name}</span>
              <span className="comp-card__right">
                {busy && <span className="spinner spinner--sm" />}
                {note && <span className="comp-row__note">{note}</span>}
                {!busy && !note && (
                  <>
                    {!isPro && <span className="comp-row__free">Free</span>}
                    <span className="comp-row__chev">›</span>
                  </>
                )}
              </span>
            </span>
            <span className="comp-card__meta tertiary">
              {[location, formatMonthYear(comp.start_date)]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {loading ? (
              <span className="comp-card__facts" aria-hidden="true">
                <span className="skel skel--fact" />
                <span className="skel skel--fact" />
              </span>
            ) : (
              hl && (
                <span className="comp-card__facts">
                  {hl.winnerName && (
                    <span className="comp-card__fact">
                      Won by {hl.winnerName}
                    </span>
                  )}
                  <span className="comp-card__fact">
                    {hl.eventCount} event{hl.eventCount === 1 ? "" : "s"}
                  </span>
                </span>
              )
            )}
          </button>
        );
      })}
    </div>
  );

  function renderRow(comp: Competition) {
    const note = unavailable[comp.id];
    const busy = selectingId === comp.id;
    const locked = !FEATURED_COMP_IDS.has(comp.id) && !isPro;
    return (
      <button
        key={comp.id}
        className={`comp-row${note ? " is-unavailable" : ""}${locked ? " is-locked" : ""}`}
        onClick={() => select(comp)}
        disabled={!!note || !!selectingId}
        aria-label={locked ? `${comp.name}, included with Pro` : comp.name}
      >
        <span className="comp-row__main">
          <span className="comp-row__name">{comp.name}</span>
          <span className="comp-row__meta tertiary">
            {[comp.city, countryName(comp.country_iso2), formatDate(comp.start_date)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="comp-row__right">
          {busy && <span className="spinner spinner--sm" />}
          {note && <span className="comp-row__note">{note}</span>}
          {!busy && !note && locked && <span className="comp-row__pro">Pro</span>}
          {!busy && !note && !locked && (
            <>
              {FEATURED_COMP_IDS.has(comp.id) && !isPro && (
                <span className="comp-row__free">Free</span>
              )}
              <span className="comp-row__chev">›</span>
            </>
          )}
        </span>
      </button>
    );
  }

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= 2004; y--) years.push(y);

  return (
    <div className="screen container picker">
      <div className="picker__head">
        <span className="eyebrow">{t("Step 1")}</span>
        <h2 className="title">{t("Pick a competition")}</h2>
        <p className="muted">
          {t("Search by name, city, or year, then pick an event and any round the competition ran.")}
        </p>
      </div>

      {!user ? (
        <>
          <p className="picker__plan-note tertiary">
            {t("Sign in to browse the full WCA library.")}
          </p>
          {featuredCards}
        </>
      ) : (
        <>
          <h3 className="picker__section-title">{t("Featured (free)")}</h3>
          {featuredCards}

          <div className="picker__browse">
            <h3 className="picker__section-title">{t("Browse all competitions")}</h3>
            {!isPro && (
              <p className="picker__plan-note tertiary">
                {t("Featured competitions are free. The full library of past WCA competitions comes with Pro.")}
              </p>
            )}

            <div className="picker__filters">
              <input
                ref={inputRef}
                className="input picker__filter-search"
                placeholder={t("Search by name or city…")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                spellCheck={false}
              />
              <select
                className="input picker__filter-select"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label={t("Country")}
              >
                <option value="">{t("All countries")}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className="input picker__filter-select"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                aria-label={t("Year")}
              >
                <option value="">{t("All years")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="picker__list card">
              {error ? (
                <div className="state-center picker__error">
                  <p className="muted">{error}</p>
                  <button
                    className="btn btn--secondary picker__retry"
                    onClick={() => setRetryNonce((n) => n + 1)}
                  >
                    {t("Try again")}
                  </button>
                </div>
              ) : (
                <>
                  {results.map(renderRow)}

                  {loading && results.length === 0 &&
                    // skeleton rows on the first load, so the box doesn't jump
                    [0, 1, 2].map((i) => (
                      <div className="skel-row" key={`skel-${i}`} aria-hidden="true">
                        <span className="skel skel--name" />
                        <span className="skel skel--meta" />
                      </div>
                    ))}

                  {!loading && results.length === 0 && (
                    <div className="state-center muted picker__empty">
                      <p>{t("No competitions found.")}</p>
                    </div>
                  )}

                  {loading && results.length > 0 && (
                    <div className="picker__more" aria-hidden="true">
                      <span className="spinner spinner--sm" />
                    </div>
                  )}

                  {/* sentinel the observer watches to pull the next page */}
                  <div ref={sentinelRef} className="picker__sentinel" aria-hidden="true" />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A curated set of the busiest cubing countries, for the Country filter. */
const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "IN", name: "India" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "BR", name: "Brazil" },
  { code: "ES", name: "Spain" },
  { code: "PL", name: "Poland" },
  { code: "NL", name: "Netherlands" },
  { code: "MX", name: "Mexico" },
  { code: "ID", name: "Indonesia" },
];

/** Parse a WCA "YYYY-MM-DD" as plain calendar parts — never timezone-shifted. */
function ymd(iso?: string): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jul 27, 2023" — for the search-result rows. */
function formatDate(iso?: string): string {
  const p = ymd(iso);
  if (!p) return "";
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

/** "July 2023" — the calmer form used on the featured info cards. */
function formatMonthYear(iso?: string): string {
  const p = ymd(iso);
  if (!p) return "";
  const long = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${long[p.m - 1]} ${p.y}`;
}

/**
 * Readable country name from an ISO 3166-1 alpha-2 code, via the platform's
 * Intl.DisplayNames (no data table to maintain). Falls back to the raw code.
 */
function countryName(iso2?: string): string {
  if (!iso2) return "";
  try {
    const dn = new Intl.DisplayNames(undefined, { type: "region" });
    return dn.of(iso2.toUpperCase()) ?? iso2;
  } catch {
    return iso2;
  }
}
