import type { Language } from "./types.ts";

export const LANGUAGES: Record<
  Language,
  { locale: string; name: string; nativeName: string; flag: string }
> = {
  sv: { locale: "sv-SE", name: "Swedish", nativeName: "Svenska", flag: "🇸🇪" },
  fr: { locale: "fr-FR", name: "French", nativeName: "Français", flag: "🇫🇷" },
};

export function otherLanguage(language: Language): Language {
  return language === "sv" ? "fr" : "sv";
}

export function greeting(language: Language): string {
  return language === "sv" ? "Hej" : "Salut";
}
