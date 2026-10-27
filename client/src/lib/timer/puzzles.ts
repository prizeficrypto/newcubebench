/**
 * The practice timer's events (scramble types), in picker order. Ids are the
 * WCA event ids (plus "none"), which is also what cubing.js and csTimer's
 * exports use, so sessions move between them without translation.
 *
 * Names are the short forms cubers use; they are puzzle names, not prose, so
 * they stay untranslated (like csTimer). "No scramble" is translated by the UI.
 */
export type TimerEvent = { id: string; name: string };

export const TIMER_EVENTS: TimerEvent[] = [
  { id: "333", name: "3×3" },
  { id: "222", name: "2×2" },
  { id: "444", name: "4×4" },
  { id: "555", name: "5×5" },
  { id: "666", name: "6×6" },
  { id: "777", name: "7×7" },
  { id: "333oh", name: "3×3 OH" },
  { id: "333bf", name: "3×3 BLD" },
  { id: "444bf", name: "4×4 BLD" },
  { id: "555bf", name: "5×5 BLD" },
  { id: "333fm", name: "3×3 FMC" },
  { id: "clock", name: "Clock" },
  { id: "minx", name: "Megaminx" },
  { id: "pyram", name: "Pyraminx" },
  { id: "skewb", name: "Skewb" },
  { id: "sq1", name: "Square-1" },
  { id: "none", name: "No scramble" },
];

const BY_ID = new Map(TIMER_EVENTS.map((e) => [e.id, e]));

export function isKnownEvent(id: string): boolean {
  return BY_ID.has(id);
}

/** Display name for an event id; unknown ids (e.g. from an import) show as-is. */
export function eventName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

/**
 * Alt+key event shortcuts (csTimer's): Alt+2..7 pick the NxN cubes, Alt+P/M/C/S
 * Pyraminx/Megaminx/Clock/Skewb, Alt+1 Square-1. Keyed by KeyboardEvent.code
 * because on macOS Option changes `key` (Option+P types "π").
 */
export const EVENT_SHORTCUTS: Record<string, string> = {
  Digit2: "222",
  Digit3: "333",
  Digit4: "444",
  Digit5: "555",
  Digit6: "666",
  Digit7: "777",
  KeyP: "pyram",
  KeyM: "minx",
  KeyC: "clock",
  KeyS: "skewb",
  Digit1: "sq1",
};
