/**
 * Live sanity check against the real WCA API: scramble grouping, ranking
 * order, advancement and the recent feed. Run: npm run verify
 * (needs network; no database). Exits non-zero on the first failed check.
 */
import {
  getEventRanking,
  getEventRoundScrambles,
  getRecentCompetitions,
} from "./wca.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

// Scramble groups: big rounds go past Z (A..Z, then AA, AB, …).
const r1 = await getEventRoundScrambles("WC2023", "333", "1", "AA");
check(
  "WC2023 3x3 round 1 group AA is selectable",
  r1.available && r1.groupId === "AA" && (r1.scrambles?.length ?? 0) >= 5,
  `${r1.groups?.length} groups, ${r1.groups?.slice(24, 28).join(" ")}`,
);
const missing = await getEventRoundScrambles("WC2023", "333", "1", "ZZ");
check("an unknown group is an error, not group A", !missing.available);

// Ranking: official order (ties broken by best single), cut from who advanced.
const pyram = await getEventRanking("WC2023", "pyram", "d");
const tie = pyram.competitors.filter((c) => c.averageCs === 567).map((c) => `${c.pos}:${c.bestCs}`);
check("tied averages are ordered by best single", tie[0]?.startsWith("185:398") ?? false, tie.join(" "));
const r1rank = await getEventRanking("WC2023", "333", "1");
check(
  "advancement counts the real cut, not the next round's size",
  (r1rank.nextRound?.advancedCount ?? 0) >= 395,
  `${r1rank.nextRound?.advancedCount} of ${r1rank.totalCompetitors}`,
);
check(
  "no-average competitors are listed after valid averages",
  r1rank.competitors.at(-1)?.averageCs === null,
);

// The recent feed surfaces newly published competitions on its own.
const recent = await getRecentCompetitions(5);
check("recent published competitions", recent.length > 0, recent.map((c) => c.id).join(", "));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
