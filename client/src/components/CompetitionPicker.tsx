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
  const isPro = Boolean(user?.pro);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<Record<string, string>>({});
  const [retryNonce, setRetryNonce] = useState(0);

  // Best-effort highlights for the featured info cards. Fetched once on mount,
  // in parallel; a failure just leaves that card without winner/events.
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [highlightsDone, setHighlightsDone] = useState(false);

  const showingFeatured = query.trim() === "";

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

  // Debounced search; the featured view needs no fetch at all.
  useEffect(() => {
    if (showingFeatured) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const { competitions } = await searchCompetitions(query);
        if (!cancelled) setResults(competitions);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, showingFeatured, retryNonce]);

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

  const rows: Competition[] = showingFeatured ? FEATURED_COMPS : results;

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

  return (
    <div className="screen container picker">
      <div className="picker__head">
        <span className="eyebrow">Step 1</span>
        <h2 className="title">Pick a competition</h2>
        <p className="muted">
          Search by name, city, or year, then pick an event and any round the
          competition ran.
        </p>
      </div>

      {user ? (
        <input
          ref={inputRef}
          className="input"
          placeholder="Search all competitions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <p className="picker__plan-note tertiary">
          Sign in to search the full WCA library.
        </p>
      )}

      {user && showingFeatured && (
        <p className="picker__plan-note tertiary">
          Featured competitions are free. The full library of past WCA
          competitions comes with Pro.
        </p>
      )}

      {!user || showingFeatured ? (
        featuredCards
      ) : (
      <div className="picker__list card">
        {loading &&
          // skeleton rows: the layout doesn't jump from empty box to list
          [0, 1, 2].map((i) => (
            <div className="skel-row" key={i} aria-hidden="true">
              <span className="skel skel--name" />
              <span className="skel skel--meta" />
            </div>
          ))}

        {!loading && error && (
          <div className="state-center picker__error">
            <p className="muted">{error}</p>
            <button
              className="btn btn--secondary picker__retry"
              onClick={() => setRetryNonce((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="state-center muted picker__empty">
            <p>No competitions found.</p>
            <p className="tertiary">
              Try a name, city, or year, like “Nationals 2023”.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          rows.map((comp) => {
            const note = unavailable[comp.id];
            const busy = selectingId === comp.id;
            const locked = !FEATURED_COMP_IDS.has(comp.id) && !isPro;
            return (
              <button
                key={comp.id}
                className={`comp-row${note ? " is-unavailable" : ""}${locked ? " is-locked" : ""}`}
                onClick={() => select(comp)}
                disabled={!!note || !!selectingId}
                aria-label={
                  locked ? `${comp.name}, included with Pro` : comp.name
                }
              >
                <span className="comp-row__main">
                  <span className="comp-row__name">{comp.name}</span>
                  <span className="comp-row__meta tertiary">
                    {[comp.city, formatDate(comp.start_date)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="comp-row__right">
                  {busy && <span className="spinner spinner--sm" />}
                  {note && <span className="comp-row__note">{note}</span>}
                  {!busy && !note && locked && (
                    <span className="comp-row__pro">Pro</span>
                  )}
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
          })}
      </div>
      )}
    </div>
  );
}

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
