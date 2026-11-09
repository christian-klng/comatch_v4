// Sprache der Oberfläche für Teilnehmende und Leinwand. Sie kommt aus dem Event; solange es noch
// nicht geladen ist (oder nicht existiert), aus dem Browser. Die Admin-Oberfläche bleibt Deutsch.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_LANGUAGE, type Language } from "@comatch/shared";
import { ApiError } from "../lib/api.ts";
import { de, type Messages } from "./de.ts";
import { en } from "./en.ts";

export type { Messages };

const MESSAGES: Record<Language, Messages> = { de, en };

export const messagesFor = (language: Language): Messages => MESSAGES[language];

/** Namen der Sprachen für die (deutsche) Admin-Oberfläche. */
export const LANGUAGE_LABELS: Record<Language, string> = { de: "Deutsch", en: "Englisch" };

/** Deutsch für deutschsprachige Browser, sonst Englisch. */
export function browserLanguage(): Language {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  return preferred.some((tag) => tag?.toLowerCase().startsWith("de")) ? "de" : "en";
}

const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);

/** Setzt die Sprache für alle Kinder und `<html lang>` (für Screenreader und Silbentrennung). */
export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.lang;
    root.lang = language;
    return () => {
      root.lang = before;
    };
  }, [language]);
  return <LanguageContext value={language}>{children}</LanguageContext>;
}

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => messagesFor(useLanguage());

/** Pfade der Rechtstexte in der jeweiligen Sprache. */
export const LEGAL_PATHS: Record<Language, { privacy: string; imprint: string }> = {
  de: { privacy: "/datenschutz", imprint: "/impressum" },
  en: { privacy: "/privacy", imprint: "/imprint" },
};

/**
 * Übersetzte Fehlermeldung. Der Server liefert Codes und deutsche Texte; übersetzt wird über den
 * Code, unbekannte Codes behalten auf Deutsch den Servertext und bekommen sonst einen allgemeinen.
 */
export function errorText(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const known = (t.errors as Record<string, string>)[error.code];
    if (known) return known;
    if (t === de && error.message) return error.message;
  }
  return t.errors.generic;
}
