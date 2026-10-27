import { useEffect, useState } from "react";
import type { AlertMode } from "./settings.ts";

/**
 * Inspection alerts: the judge's "8 seconds" / "12 seconds" calls, spoken with
 * the browser's own speech synthesis (no audio files to ship), or a short
 * beep. Everything here is best-effort — a browser without speech, or one
 * that refuses to play, must never affect timing.
 */

const hasSpeech = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/** BCP-47 tag for the app language, so the voice speaks the right language. */
export function speechLang(lang: string): string {
  return lang === "fr" ? "fr-FR" : lang === "ko" ? "ko-KR" : lang === "es" ? "es-ES" : "en-US";
}

/**
 * iOS/Safari only allow speech that a user gesture started. Speaking a silent
 * utterance on the first key press or tap unlocks it for the rest of the page.
 */
let primed = false;
export function primeSpeech(): void {
  if (primed || !hasSpeech()) return;
  primed = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* best-effort */
  }
}

/** Installed voices for a language (falls back to every voice). */
export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  if (!hasSpeech()) return [];
  const all = window.speechSynthesis.getVoices();
  const prefix = speechLang(lang).slice(0, 2);
  const matching = all.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  return matching.length ? matching : all;
}

/** The voice list, refreshed when the browser finishes loading voices. */
export function useVoices(lang: string): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(() => voicesFor(lang));
  useEffect(() => {
    if (!hasSpeech()) return;
    const update = () => setVoices(voicesFor(lang));
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, [lang]);
  return voices;
}

// Common system voice names, used to honour "Male" / "Female" when the user
// hasn't picked a specific voice. Browsers don't expose a gender field.
const FEMALE =
  /female|samantha|victoria|karen|moira|tessa|zira|susan|serena|fiona|allison|ava|amelie|aurelie|marie|audrey|yuna|sora|heami|monica|paulina|helena|lucia|elvira/i;
const MALE =
  /\bmale|daniel|alex|fred|david|mark|george|oliver|thomas|rishi|aaron|arthur|jorge|diego|juan|pablo|nicolas|jinho|injoon|minjun/i;

function pickVoice(mode: AlertMode, voiceName: string, lang: string) {
  const voices = voicesFor(lang);
  if (voiceName) {
    const named = voices.find((v) => v.name === voiceName);
    if (named) return named;
  }
  const want = mode === "male" ? MALE : FEMALE;
  return (
    voices.find((v) => want.test(v.name) && !(mode === "male" && FEMALE.test(v.name))) ??
    voices.find((v) => v.default) ??
    voices[0] ??
    null
  );
}

let audioCtx: AudioContext | null = null;

/** A short sine beep (Web Audio), for "beep instead of voice". */
export function beep(volume: number): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.4;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime;
    osc.start(t);
    osc.stop(t + 0.12);
  } catch {
    /* no audio available */
  }
}

/** Say (or beep) one alert. `text` is already translated. */
export function announce(
  text: string,
  opts: { mode: AlertMode; voiceName: string; volume: number; lang: string },
): void {
  if (opts.mode === "off") return;
  if (opts.mode === "beep" || !hasSpeech()) {
    beep(opts.volume);
    return;
  }
  try {
    const synth = window.speechSynthesis;
    synth.cancel(); // never queue behind a stale call
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(opts.lang);
    u.volume = Math.max(0, Math.min(1, opts.volume / 100));
    u.rate = 1.1;
    const voice = pickVoice(opts.mode, opts.voiceName, opts.lang);
    if (voice) u.voice = voice;
    // No matching male/female system voice: shift the pitch instead.
    if (!opts.voiceName && voice && !(opts.mode === "male" ? MALE : FEMALE).test(voice.name)) {
      u.pitch = opts.mode === "male" ? 0.7 : 1.3;
    }
    synth.speak(u);
  } catch {
    beep(opts.volume);
  }
}
