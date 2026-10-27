import type { Penalty } from "./model.ts";
import { EVENT_SHORTCUTS } from "./puzzles.ts";

/**
 * The timer's keyboard shortcuts (csTimer's set), as a pure mapping from a
 * key event to an intent. Matched on KeyboardEvent.code, not key: on macOS
 * Option rewrites `key` (Option+2 types "™"), and layouts move letters.
 *
 *   Alt+2…7, Alt+P/M/C/S/1   switch event (NxN, Pyraminx, Megaminx, Clock, Skewb, Square-1)
 *   Alt+← / Alt+→            previous / next scramble
 *   Alt+↑ / Alt+↓            previous / next session
 *   Ctrl+1 / 2 / 3           latest solve OK / +2 / DNF
 *   Ctrl+Z or Alt+Z          delete the latest solve (after a confirm)
 */
export type Shortcut =
  | { kind: "event"; event: string }
  | { kind: "scramble"; dir: -1 | 1 }
  | { kind: "session"; dir: -1 | 1 }
  | { kind: "penalty"; penalty: Penalty }
  | { kind: "deleteLast" };

export type KeyLike = {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export function shortcutFor(e: KeyLike): Shortcut | null {
  // Cmd/Win combos belong to the browser and OS; Shift variants are left alone.
  if (e.metaKey || e.shiftKey) return null;
  if (e.altKey && !e.ctrlKey) {
    if (e.code === "ArrowLeft") return { kind: "scramble", dir: -1 };
    if (e.code === "ArrowRight") return { kind: "scramble", dir: 1 };
    if (e.code === "ArrowUp") return { kind: "session", dir: -1 };
    if (e.code === "ArrowDown") return { kind: "session", dir: 1 };
    if (e.code === "KeyZ") return { kind: "deleteLast" };
    const event = EVENT_SHORTCUTS[e.code];
    if (event) return { kind: "event", event };
    return null;
  }
  if (e.ctrlKey && !e.altKey) {
    if (e.code === "Digit1" || e.code === "Numpad1") return { kind: "penalty", penalty: 0 };
    if (e.code === "Digit2" || e.code === "Numpad2") return { kind: "penalty", penalty: 2000 };
    if (e.code === "Digit3" || e.code === "Numpad3") return { kind: "penalty", penalty: -1 };
    if (e.code === "KeyZ") return { kind: "deleteLast" };
  }
  return null;
}

/**
 * True when keystrokes belong to something else: a text field, a select, an
 * editable region, or an open dialog. The timer and its shortcuts stand down.
 */
export function keysBelongElsewhere(target: EventTarget | null, doc: Document): boolean {
  if (doc.querySelector("dialog[open]")) return true;
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(
    el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"),
  );
}
