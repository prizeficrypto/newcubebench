import { useEffect, useRef } from "react";
import { useT } from "../lib/i18n.tsx";

/**
 * One Google AdSense unit. Renders nothing at all — no box, no gap — until
 * AdSense is configured (VITE_ADSENSE_CLIENT plus a slot id for this
 * placement). The AdSense script loads once, after the page has painted, so
 * ads never slow the timer down.
 *
 * Placement is the page's job: units sit below the main content, never in or
 * beside the timer, and are never hidden or covered once served (AdSense
 * policy). EEA/UK/Swiss consent is handled by Google's own consent message,
 * switched on in the AdSense dashboard.
 */
type Placement = "timer" | "competitions" | "results" | "footer";

const CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT ?? "").trim();
const SLOTS: Record<Placement, string> = {
  timer: import.meta.env.VITE_ADSENSE_SLOT_TIMER ?? "",
  competitions: import.meta.env.VITE_ADSENSE_SLOT_COMPETITIONS ?? "",
  results: import.meta.env.VITE_ADSENSE_SLOT_RESULTS ?? "",
  footer: import.meta.env.VITE_ADSENSE_SLOT_FOOTER ?? "",
};

let scriptRequested = false;

/** Load adsbygoogle.js once, when the browser is idle. */
function loadAdSense(): void {
  if (scriptRequested || !CLIENT) return;
  scriptRequested = true;
  const add = () => {
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
    document.head.appendChild(s);
  };
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) idle(add, { timeout: 3000 });
  else setTimeout(add, 1500);
}

export function AdSlot({ placement }: { placement: Placement }) {
  const { t } = useT();
  const slot = SLOTS[placement].trim();
  const ins = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || !slot || pushed.current || !ins.current) return;
    pushed.current = true; // once per mounted unit (StrictMode mounts twice)
    loadAdSense();
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* an ad blocker or a not-yet-approved site: leave the space empty */
    }
  }, [slot]);

  if (!CLIENT || !slot) return null;
  return (
    <aside className="adslot" aria-label={t("Advertisement")}>
      <span className="adslot__label tertiary">{t("Advertisement")}</span>
      <ins
        ref={ins}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
