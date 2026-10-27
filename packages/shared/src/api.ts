// Antwort-Typen der HTTP-API.
import type { EventStatus } from "./domain.ts";
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
