/**
 * Post-build prerender: writes a static HTML file per important URL so
 * crawlers that don't run JavaScript (many AI answer engines) and link
 * previews get the right title, description, canonical URL and readable
 * text for each page — not one generic shell. Each file still loads the full
 * app, which takes over on arrival.
 *
 *   dist/timer/<slug>.html     one per puzzle (served at /timer/<slug>)
 *   dist/app/competitions.html  the simulator
 *   dist/welcome.html           the about page
 *   dist/sitemap.xml            every URL above, plus the homepage
 *
 * Run after `vite build` (see package.json). Vercel's cleanUrls and Express's
 * `extensions: ["html"]` serve /timer/2x2 from timer/2x2.html.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUZZLE_PAGES, puzzlePageDescription, puzzlePageTitle } from "../src/lib/puzzlePages.ts";
import { FAQ, FEATURES } from "../src/lib/seoContent.ts";

const ORIGIN = "https://www.cubebench.app";
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const shell = readFileSync(join(dist, "index.html"), "utf8");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const puzzleLinks =
  "<p>" +
  PUZZLE_PAGES.map((p) => `<a href="/timer/${p.slug}">${esc(p.name)} timer</a>`).join(" · ") +
  "</p>";

type Page = { path: string; file: string; title: string; description: string; body: string };

function render(page: Page): string {
  let html = shell;
  const set = (re: RegExp, value: string) => {
    if (!re.test(html)) throw new Error(`prerender: pattern not found ${re}`);
    html = html.replace(re, value);
  };
  set(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  set(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`);
  set(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(page.title)}$2`);
  set(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`);
  set(/(<meta property="og:url" content=")[^"]*(")/, `$1${ORIGIN}${page.path}$2`);
  html = html.replace("</head>", `  <link rel="canonical" href="${ORIGIN}${page.path}" />\n  </head>`);
  set(/<main class="prerender">[\s\S]*?<\/main>/, `<main class="prerender">${page.body}</main>`);
  return html;
}

function write(page: Page): void {
  const out = join(dist, page.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(page));
}

// The homepage keeps its hand-written content; it just gains a canonical.
writeFileSync(
  join(dist, "index.html"),
  shell.replace("</head>", `  <link rel="canonical" href="${ORIGIN}/" />\n  </head>`),
);

const faqHtml = FAQ.slice(0, 4)
  .map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`)
  .join("");

for (const p of PUZZLE_PAGES) {
  write({
    path: `/timer/${p.slug}`,
    file: `timer/${p.slug}.html`,
    title: puzzlePageTitle(p),
    description: puzzlePageDescription(p),
    body:
      `<h1>${esc(p.name)} timer</h1>` +
      `<p>A free online ${esc(p.name)} timer with official WCA random-state scrambles, WCA inspection with spoken 8 and 12 second calls, and ao5, ao12 and session statistics. ${esc(p.detail)} It works in any browser, on desktop and phone, with no download.</p>` +
      `<h2>Features</h2><ul>${FEATURES.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` +
      `<h2>Timers for other puzzles</h2>${puzzleLinks}` +
      `<h2>Frequently asked questions</h2>${faqHtml}` +
      `<p><a href="/">Cube timer</a> · <a href="/app/competitions">WCA competition simulator</a></p>`,
  });
}

write({
  path: "/app/competitions",
  file: "app/competitions.html",
  title: "WCA Competition Simulator · Solve Real Competition Scrambles | Cube Bench",
  description:
    "Solve the official scrambles from any past WCA competition round and see where your average would have placed against the real results. Free, in your browser.",
  body:
    "<h1>WCA competition simulator</h1>" +
    "<p>Pick any past World Cube Association competition, choose an event and a round, and solve that round's exact official scrambles with a WCA-style timer and inspection. Cube Bench then places your average against the round's real results using WCA ranking rules: ties broken by best single, cutoffs in combined rounds, and DNF averages ranked by best single. Newly published competitions appear automatically.</p>" +
    "<p>Events: 3x3, 2x2, 4x4, 5x5, 6x6, 7x7, 3x3 one-handed, Megaminx, Pyraminx, Skewb, Square-1 and Clock.</p>" +
    `<p><a href="/">Practice with the cube timer</a></p>${puzzleLinks}`,
});

write({
  path: "/welcome",
  file: "welcome.html",
  title: "Cube Bench · Free Cube Timer and WCA Competition Simulator",
  description:
    "Find out where you'd actually place: a free Rubik's Cube timer plus a simulator that lets you solve the real scrambles from past WCA competitions.",
  body:
    "<h1>Find out where you'd actually place</h1>" +
    "<p>Cube Bench is a free speedcubing timer and WCA competition simulator. Practice with official scrambles and real statistics, then solve the actual scrambles from past WCA competitions to see where your average would have placed against the people who were there.</p>" +
    `<p><a href="/">Open the cube timer</a> · <a href="/app/competitions">Simulate a competition</a></p>${puzzleLinks}`,
});

// Sitemap from the same list, so a new puzzle page can't be forgotten.
const urls: [string, string, string][] = [
  ["/", "weekly", "1.0"],
  ...PUZZLE_PAGES.map((p): [string, string, string] => [`/timer/${p.slug}`, "monthly", "0.8"]),
  ["/app/competitions", "daily", "0.8"],
  ["/welcome", "monthly", "0.5"],
  ["/privacy", "yearly", "0.2"],
];
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(([path, freq, pri]) => `  <url><loc>${ORIGIN}${path}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`)
      .join("\n") +
    "\n</urlset>\n",
);

console.log(`prerendered ${PUZZLE_PAGES.length + 2} pages + sitemap (${urls.length} URLs)`);
