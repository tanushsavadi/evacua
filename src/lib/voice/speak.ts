"use client";

/**
 * Thin wrapper around the Web Speech API so the rest of the app can stay
 * framework-agnostic. Voice is intentionally optional — if the browser can't
 * synthesize, `speak()` returns false and the UI can show a static brief.
 */

export type BriefPosture = "watch" | "prepare" | "leave";

export function isVoiceAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function cancelSpeech() {
  if (!isVoiceAvailable()) return;
  window.speechSynthesis.cancel();
}

function preferVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  // Prefer premium English voices (Google / Samantha / Apple Neural).
  const ranked = [
    "Google US English",
    "Samantha",
    "Karen",
    "Serena",
    "Alex",
    "Google UK English Female",
  ];
  for (const name of ranked) {
    const hit = en.find((v) => v.name === name);
    if (hit) return hit;
  }
  return en[0] ?? voices[0];
}

export function speak(
  text: string,
  opts: { rate?: number; pitch?: number; onend?: () => void } = {},
): boolean {
  if (!isVoiceAvailable()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = opts.rate ?? 1.0;
  utter.pitch = opts.pitch ?? 1.0;
  utter.volume = 1;
  const voices = synth.getVoices();
  const voice = preferVoice(voices);
  if (voice) utter.voice = voice;
  if (opts.onend) utter.onend = () => opts.onend?.();
  synth.speak(utter);
  return true;
}

export function composeBrief(input: {
  posture: BriefPosture;
  leaveByMinutes: number | null;
  destinationLabel: string;
  primaryVia: string;
  firstHighTask?: string;
  addressLine?: string;
}): string {
  const { posture, leaveByMinutes, destinationLabel, primaryVia, firstHighTask } = input;

  const lead =
    posture === "leave"
      ? "This is an evacuation brief. Go now."
      : posture === "prepare"
        ? "Evacua brief. Prepare to leave."
        : "Evacua brief. You are on watch.";

  const leaveBy =
    leaveByMinutes == null
      ? ""
      : leaveByMinutes <= 0
        ? " Leave-by window has passed — begin immediately."
        : ` Leave-by is in ${leaveByMinutes} minute${leaveByMinutes === 1 ? "" : "s"}.`;

  const dest =
    posture === "watch"
      ? ""
      : ` Head to ${destinationLabel} via ${primaryVia}.`;

  const next = firstHighTask ? ` Next step: ${firstHighTask}.` : "";

  return `${lead}${leaveBy}${dest}${next}`.trim();
}
