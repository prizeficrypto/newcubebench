import { useEffect } from "react";

/**
 * Per-page search metadata for a single-page app: the HTML shell has one
 * <title>, so each page sets its own title, description, canonical URL and
 * social-preview tags when it mounts (search engines render JavaScript and
 * read these). Private pages ask not to be indexed.
 */
export const SITE_ORIGIN = "https://www.cubebench.app";

function setMeta(attr: "name" | "property", key: string, value: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

export function usePageMeta(meta: {
  title: string;
  description?: string;
  /** canonical path, e.g. "/app/competitions" */
  path?: string;
  /** keep this page out of search results (settings, sign-in…) */
  noindex?: boolean;
}): void {
  const { title, description, path, noindex } = meta;
  useEffect(() => {
    document.title = title;
    setMeta("property", "og:title", title);
    if (description) {
      setMeta("name", "description", description);
      setMeta("property", "og:description", description);
    }
    if (path !== undefined) {
      setCanonical(SITE_ORIGIN + path);
      setMeta("property", "og:url", SITE_ORIGIN + path);
    }
    setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");
  }, [title, description, path, noindex]);
}
