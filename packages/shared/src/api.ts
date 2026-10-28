// Antwort-Typen der HTTP-API.
import type { EventStatus, MatchGroupKind, ParticipantStatus } from "./domain.ts";
import type { QuestionInput } from "./event-config.ts";

export interface ApiErrorBody {
  error: string;
  message?: string;
  /** Feldfehler aus der Validierung, Pfad → Meldung. */
  issues?: Record<string, string>;
}

export interface AdminMe {
  id: string;
  email: string;
}

export interface AdminListItem {
  id: string;
  email: string;
  createdAt: string;
  invitedByEmail: string | null;
}

export interface InviteListItem {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  invitedByEmail: string | null;
}

export interface InviteCreated extends InviteListItem {
  /** Nur direkt nach dem Anlegen bekannt; danach liegt nur der Hash in der DB. */
  acceptUrl: string;
}

export interface InvitePreview {
  email: string;
  expiresAt: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  startsAt: string | null;
  participantCount: number;
  createdAt: string;
}

export interface EventDetail extends EventSummary {
  roundDurationS: number;
  firstMatchDelayS: number;
  primaryColor: string | null;
  /** URL des Logos (mit Cache-Buster) oder null. */
  logoUrl: string | null;
  joinUrl: string;
  presenterUrl: string;
  /** Fragen sind gesperrt, sobald jemand beigetreten ist (sonst passen Antworten nicht mehr). */
  questionsLocked: boolean;
  questions: QuestionInput[];
}

/** Eine teilnehmende Person in der Moderationsansicht (anonym, Nummer nach Beitritt). */
export interface AdminParticipant {
  id: string;
  /** „T001“ usw., nach Beitrittszeit. */
  number: string;
  status: ParticipantStatus;
  selfieUrl: string | null;
  joinedAt: string;
  /** Verbunden oder erst seit Kurzem weg. */
  online: boolean;
  /** Gewählte Antwort je Frage (Beschriftung), in Fragenreihenfolge. */
  answers: string[];
  confirmedMatches: number;
}

export interface EventStats {
  /** Fertig angemeldet (mit Selfie), auch wenn inzwischen inaktiv. */
  participants: number;
  rounds: number;
  matches: {
    total: number;
    confirmed: number;
    expired: number;
    open: number;
    /** Bestätigte unter den abgeschlossenen Matches (ohne offene), 0–1; null ohne Daten. */
    confirmationRate: number | null;
  };
  perPerson: {
    average: number;
    median: number;
    max: number;
    withoutMatch: number;
    /** Wie viele Personen wie viele bestätigte Matches haben (0 … max). */
    histogram: { matches: number; people: number }[];
  };
  byRound: { round: number; matches: number; confirmed: number; confirmationRate: number | null }[];
  byKind: Record<MatchGroupKind, { matches: number; confirmed: number }>;
}
