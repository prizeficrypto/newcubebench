import { useT, type Lang } from "../lib/i18n.tsx";

/**
 * Compact language control for the navs. A minimally styled native <select>
 * so it stays keyboard- and screen-reader-friendly and needs no dropdown code.
 */
const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
];

export function LanguageSwitcher() {
  const { lang, setLang } = useT();
  return (
    <label className="lang-switch">
      <span className="lang-switch__sr">Language</span>
      <select
        className="lang-switch__select"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label="Language"
      >
        {LANGS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
