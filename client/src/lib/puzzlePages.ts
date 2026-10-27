/**
 * One landing page per puzzle (/timer/2x2, /timer/megaminx …): the same
 * timer, opened on that puzzle, with its own title, description and copy.
 * Each answers one specific search ("pyraminx timer") far better than a
 * generic page can. Used by the app (page meta, session switch) and by
 * scripts/prerender.ts (static HTML per page for crawlers).
 */
export type PuzzlePage = {
  slug: string;
  /** our timer event id */
  event: string;
  /** short name as cubers search it */
  name: string;
  /** one specific line about this puzzle and its WCA format */
  detail: string;
};

export const PUZZLE_PAGES: PuzzlePage[] = [
  { slug: "3x3", event: "333", name: "3x3", detail: "The classic Rubik's Cube. Official WCA rounds are an average of 5, and that's what the ao5 here calculates." },
  { slug: "2x2", event: "222", name: "2x2", detail: "The 2x2 Pocket Cube is all about short, fast solves, so millisecond precision and a quick hold-to-start matter. WCA rounds are an average of 5." },
  { slug: "4x4", event: "444", name: "4x4", detail: "The 4x4 Rubik's Revenge uses longer random-state scrambles with wide moves. WCA rounds are an average of 5." },
  { slug: "5x5", event: "555", name: "5x5", detail: "The 5x5 Professor's Cube: long solves, so stats like ao12 and your session mean show progress best. WCA rounds are an average of 5." },
  { slug: "6x6", event: "666", name: "6x6", detail: "6x6 rounds at WCA competitions are a mean of 3, and every solve gets an official 6x6 scramble." },
  { slug: "7x7", event: "777", name: "7x7", detail: "7x7 rounds at WCA competitions are a mean of 3. Times over 10 minutes are rounded the official WCA way." },
  { slug: "one-handed", event: "333oh", name: "3x3 one-handed", detail: "Practice one-handed solving (OH) with official 3x3 scrambles. WCA OH rounds are an average of 5." },
  { slug: "blindfolded", event: "333bf", name: "3x3 blindfolded", detail: "3BLD scrambles with random orientation, timed from memorization to the end of the solve, like the WCA's best of 3." },
  { slug: "megaminx", event: "minx", name: "Megaminx", detail: "Official WCA Megaminx scrambles in Pochmann notation, with averages calculated like a WCA average of 5." },
  { slug: "pyraminx", event: "pyram", name: "Pyraminx", detail: "Random-state Pyraminx scrambles including tip moves, the same kind the WCA uses. Rounds are an average of 5." },
  { slug: "skewb", event: "skewb", name: "Skewb", detail: "Random-state Skewb scrambles like the WCA's, with ao5 and ao12 for fast, consistent practice." },
  { slug: "square-1", event: "sq1", name: "Square-1", detail: "Official random-state Square-1 scrambles, written in the standard (top, bottom) / notation." },
  { slug: "clock", event: "clock", name: "Rubik's Clock", detail: "Official WCA Clock scrambles with pin and dial notation. Rounds are an average of 5." },
  { slug: "4x4-blindfolded", event: "444bf", name: "4x4 blindfolded", detail: "4BLD practice with official random-state 4x4 scrambles and full solve timing." },
  { slug: "5x5-blindfolded", event: "555bf", name: "5x5 blindfolded", detail: "5BLD practice with official 5x5 scrambles and full solve timing." },
  { slug: "fmc", event: "333fm", name: "Fewest moves (FMC)", detail: "Get official 3x3 Fewest Moves scrambles to practice FMC. Use the timer to keep to the one-hour limit." },
];

export const PAGE_BY_SLUG = new Map(PUZZLE_PAGES.map((p) => [p.slug, p]));

export function puzzlePageTitle(p: PuzzlePage): string {
  return `${p.name} Timer · Free Online ${p.name} Timer with WCA Scrambles | Cube Bench`;
}

export function puzzlePageDescription(p: PuzzlePage): string {
  return `Free online ${p.name} timer with official WCA scrambles, inspection, ao5 and ao12 averages and session stats. ${p.detail}`;
}
