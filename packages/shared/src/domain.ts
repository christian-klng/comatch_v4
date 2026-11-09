// Statuswerte, die Server, Datenbank (pgEnum) und Clients gemeinsam nutzen.

export const EVENT_STATUSES = ["draft", "open", "running", "paused", "ended"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const PARTICIPANT_STATUSES = [
  "onboarding",
  "pool",
  "matched",
  "confirmed",
  "inactive",
  "removed",
] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

/** same: gleiche Antwort passt; complementary: sich ergänzende Antworten passen. */
export const MATCH_MODES = ["same", "complementary"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

/** round: beim Rundenwechsel erzeugt; pool: Schnellmatch für Neue während einer Runde. */
export const MATCH_GROUP_KINDS = ["round", "pool"] as const;
export type MatchGroupKind = (typeof MATCH_GROUP_KINDS)[number];

export const MATCH_GROUP_STATUSES = ["open", "confirmed", "expired"] as const;
export type MatchGroupStatus = (typeof MATCH_GROUP_STATUSES)[number];

/** Sprache der Oberfläche für Teilnehmende und Leinwand. Die Fragen übersetzen Admins selbst. */
export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "de";

export function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}
