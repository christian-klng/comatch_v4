import { z } from "zod";
import type { EventStatus, MatchGroupKind, ParticipantStatus } from "./domain.ts";

/** Wer so lange keine Verbindung hatte, gilt als inaktiv und wird nicht mehr gepaart. */
export const INACTIVE_AFTER_MS = 60_000;

/** Kurz vor Rundenende lohnt kein neues Match mehr; Wartende kommen in die nächste Runde. */
export const POOL_CUTOFF_MS = 60_000;

/** Länge der Bestätigungscodes (dreistellige Zahlen ohne führende Null). */
export const CODE_LENGTH = 3;
/** Sperre nach einer falschen Auswahl. */
export const WRONG_CODE_LOCK_MS = 5_000;
/** Ab so vielen Fehlversuchen gibt es keine Auswahl mehr, nur noch die Eingabe des Codes. */
export const MAX_CODE_CHOICES_ATTEMPTS = 3;
/** „Nicht gefunden“ geht frühestens ab Rundenmitte und nach so langer Suche. */
export const NOT_FOUND_MIN_SEARCH_MS = 60_000;

export const matchActionInput = z.object({ matchId: z.uuid() });
export const confirmCodeInput = matchActionInput.extend({
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${CODE_LENGTH}}$`)),
});
export type ConfirmCodeInput = z.infer<typeof confirmCodeInput>;

/** Ergebnis einer Code-Auswahl; der neue Zustand kommt zusätzlich per Socket. */
export interface ConfirmCodeResult {
  result: "wrong" | "correct" | "confirmed";
  state: ParticipantLive;
}

/** Steuerung eines Events durch Admins. */
export const EVENT_CONTROL_ACTIONS = ["start", "pause", "resume", "next_round", "end"] as const;
export type EventControlAction = (typeof EVENT_CONTROL_ACTIONS)[number];
export const eventControlInput = z.object({ action: z.enum(EVENT_CONTROL_ACTIONS) });

/** Taktgeber eines Events; Zeiten in ms Serverzeit. */
export interface LiveClock {
  status: EventStatus;
  round: number;
  /** Ende der laufenden Runde oder null (vor dem Start, pausiert, beendet). */
  roundEndsAt: number | null;
  /** Restzeit der Runde, solange pausiert. */
  pausedRemainingMs: number | null;
  roundDurationS: number;
}

/** Vollständiger Zustand für das Handy einer teilnehmenden Person („Snapshot statt Delta“). */
export interface ParticipantLive {
  serverNow: number;
  clock: LiveClock;
  status: ParticipantStatus;
  /** Wie viele Personen gerade aktiv mitmachen (für „Du bist die erste Person“). */
  activeParticipants: number;
  match: ParticipantMatch | null;
  /** Das letzte Match dieser Runde wurde aufgelöst (nicht gefunden oder ausgestiegen). */
  previousMatchEnded: boolean;
}

/** Gesprächseinstieg: eine Frage, bei der zwei Personen zusammenpassen. */
export interface CommonGround {
  question: string;
  /** „same“: beide dieselbe Antwort; „complement“: Antworten ergänzen sich. */
  kind: "same" | "complement";
  own: string;
  partner: string;
}

export interface MatchPartner {
  id: string;
  selfieUrl: string | null;
  commonGround: CommonGround[];
  /** Diese Person muss meinen Code auswählen und hat das schon getan. */
  confirmedMe: boolean;
}

export interface ParticipantMatch {
  id: string;
  kind: MatchGroupKind;
  /** „confirmed“: alle in der Gruppe haben bestätigt, Pause bis Rundenende. */
  status: "open" | "confirmed";
  /** Eigener Code, den das Gegenüber auswählen muss. */
  ownCode: string;
  /** Übereinstimmung 0–1. */
  similarity: number;
  partners: MatchPartner[];
  confirm: {
    /** Wessen Code ich auswählen muss (bei Dreiergruppen eine der beiden Personen). */
    targetId: string;
    /** Drei Codes zur Auswahl; null nach zu vielen Fehlversuchen (dann Eingabe). */
    options: string[] | null;
    wrongAttempts: number;
    /** Gesperrt bis (Serverzeit) nach einer falschen Auswahl. */
    lockedUntil: number | null;
    confirmed: boolean;
  };
  /** Ab wann (Serverzeit) „Nicht gefunden“ möglich ist; null, wenn gar nicht mehr. */
  notFoundFrom: number | null;
}

/** Zustand für Leinwand und Admins. */
export interface EventLive {
  serverNow: number;
  clock: LiveClock;
  counts: {
    /** Fragen und Selfie erledigt (alle außer onboarding und removed). */
    joined: number;
    active: number;
    waiting: number;
    matched: number;
    confirmed: number;
    inactive: number;
  };
  /** Matches der laufenden Runde. */
  matches: { open: number; confirmed: number };
  /** Über alle Runden: bestätigte Matches und gestartete Runden (für Leinwand und Abschluss). */
  totals: { confirmedMatches: number; rounds: number };
  /**
   * Bestätigte Matches der laufenden Runde, älteste zuerst (höchstens RECENT_MATCHES_LIMIT).
   * Die Leinwand animiert alle, die sie noch nicht kennt.
   */
  recentConfirmed: ConfirmedMatch[];
  /**
   * Selfies (signierte URLs) für die Leinwand: vor dem Start die zuletzt Beigetretenen
   * (neueste zuerst, höchstens LOBBY_SELFIES_LIMIT), nach dem Ende alle für die Collage, sonst leer.
   */
  selfies: string[];
}

export interface ConfirmedMatch {
  id: string;
  selfies: (string | null)[];
  confirmedAt: number;
}

export const RECENT_MATCHES_LIMIT = 30;
export const LOBBY_SELFIES_LIMIT = 24;

/** Statische Angaben für die Leinwand (Abruf mit dem Presenter-Token). */
export interface PresenterEvent {
  id: string;
  title: string;
  joinUrl: string;
  logoUrl: string | null;
  primaryColor: string | null;
}
