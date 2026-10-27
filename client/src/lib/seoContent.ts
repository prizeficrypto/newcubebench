/**
 * The timer page's About copy, written for people first and search/answer
 * engines second: plain definitions and direct answers. English strings are
 * the i18n keys (see dict/timer.ts). Keep in sync with the JSON-LD FAQ and
 * the crawler fallback in client/index.html.
 */
export const ABOUT_TITLE = "Cube Timer: free online Rubik's Cube timer";

export const ABOUT_INTRO =
  "Cube Bench is a free online Rubik's Cube timer for speedcubers. Every solve gets an official WCA random-state scramble, and your times, averages (ao5, ao12, ao100) and personal bests are tracked automatically. It works in any browser, on desktop and phone, with no download.";

export const FEATURES = [
  "Official WCA scrambles for 3x3, 2x2, 4x4 to 7x7, OH, BLD, Pyraminx, Megaminx, Skewb, Square-1 and Clock",
  "WCA inspection with spoken 8 and 12 second calls",
  "Ao5, ao12 and session stats calculated the official WCA way",
  "Import and export csTimer, Twisty Timer and Cubic Timer times",
  "Stackmat and GAN Smart Timer support, or type your times in",
  "Cross solver, scramble images, trend charts and a metronome",
  "Competition simulator: solve the real scrambles from past WCA competitions and see where you would have placed",
];

export const FAQ: [string, string][] = [
  ["Is Cube Bench free?", "Yes. The cube timer, every tool and the competition simulator are free to use in any browser, with no download or account needed."],
  ["How do I use the Rubik's Cube timer?", "Hold the spacebar (or touch and hold on a phone) until the time turns green, let go to start, and press any key or tap to stop. Every solve gets a new official WCA scramble."],
  ["Does Cube Bench use official WCA scrambles?", "Yes. Scrambles are random-state scrambles made the same way as the World Cube Association's official scrambler, for 3x3, 2x2, 4x4 to 7x7, one-handed, blindfolded, Pyraminx, Megaminx, Skewb, Square-1 and Clock."],
  ["How is an ao5 calculated?", "An average of 5 (ao5) drops your best and worst solve and averages the middle three, exactly like an official WCA average. An ao12 drops one best and one worst of the last 12."],
  ["Can I import my times from csTimer?", "Yes. Import a csTimer export file, a Twisty Timer or Cubic Timer export, or a plain list of times, and your sessions are added. You can export back to csTimer's format at any time."],
  ["Does it work with a Stackmat timer?", "Yes. Plug a Stackmat into your computer's microphone or line-in jack and connect it in the timer settings. GAN Smart Timers connect over Bluetooth in Chrome and Edge."],
  ["What is the WCA competition simulator?", "Pick a past WCA competition, solve the exact scrambles from one of its rounds, and see where your average would have placed against the official results."],
];
