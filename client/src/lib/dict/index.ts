import { dict as core } from "./core.ts";
import { dict as flow } from "./flow.ts";
import { dict as results } from "./results.ts";
import { dict as home } from "./home.ts";
import { dict as timer } from "./timer.ts";
import { dict as tools } from "./tools.ts";
import { dict as social } from "./social.ts";
import { dict as account } from "./account.ts";

/**
 * Every translation, merged per language. This module is only ever loaded
 * with a dynamic import (see i18n.tsx), so English visitors never download
 * it. Later areas win on a duplicate key, same as before the split.
 */
export type Translated = "fr" | "ko" | "es";

const parts = [core, flow, results, home, timer, tools, social, account];

export const DICTS: Record<Translated, Record<string, string>> = {
  fr: Object.assign({}, ...parts.map((p) => p.fr)),
  ko: Object.assign({}, ...parts.map((p) => p.ko)),
  es: Object.assign({}, ...parts.map((p) => p.es)),
};
