import { LANGUAGES } from "../../shared/languages.ts";
import type { Language } from "../../shared/types.ts";
import { isNativeApp } from "./native.ts";

export async function speak(text: string, language: Language): Promise<void> {
  const value = text.trim();
  if (!value) return;
  const locale = LANGUAGES[language].locale;
  if (isNativeApp()) {
    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      await TextToSpeech.speak({ text: value, lang: locale, rate: 0.9, pitch: 1, volume: 1 });
      return;
    } catch (error) {
      console.warn("Native speech failed", error);
    }
  }
  if (!("speechSynthesis" in window)) {
    throw new Error("This device has no text-to-speech voice for that language.");
  }
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = locale;
    utterance.rate = 0.9;
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith(language));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("Speech was interrupted."));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export function warmVoices(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
}
