import { z } from "zod";
import type { EventStatus, ParticipantStatus } from "./domain.ts";
import { QUESTION_COUNT } from "./event-config.ts";

/** Schutz gegen Missbrauch; geplant sind bis zu 100 Teilnehmende pro Event. */
export const MAX_PARTICIPANTS_PER_EVENT = 250;

/** Das Handy verkleinert Selfies vor dem Upload, typisch sind 100–200 KB. */
export const SELFIE_MAX_BYTES = 1024 * 1024;
export const SELFIE_MAX_DIMENSION = 720;

/** In diesen Status kann man einem Event beitreten. */
export const JOINABLE_EVENT_STATUSES = ["open", "running", "paused"] as const satisfies EventStatus[];

export function isJoinable(status: EventStatus): boolean {
  return (JOINABLE_EVENT_STATUSES as readonly EventStatus[]).includes(status);
}

export const joinInput = z.object({
  /** Gewählte Antwort-ID je Frage, in der Reihenfolge der Fragen. */
  answers: z.array(z.uuid()).length(QUESTION_COUNT),
  consent: z.literal(true, "Bitte stimme der Verarbeitung deines Fotos zu."),
});
export type JoinInput = z.infer<typeof joinInput>;

/** Was das Handy über ein Event sehen darf (ohne Matching-Konfiguration). */
export interface PublicEvent {
  slug: string;
  title: string;
  status: EventStatus;
  joinable: boolean;
  roundDurationS: number;
  logoUrl: string | null;
  primaryColor: string | null;
  questions: {
    id: string;
    text: string;
    options: { id: string; label: string }[];
  }[];
}

export interface ParticipantMe {
  id: string;
  eventSlug: string;
  status: ParticipantStatus;
  /** Kurzlebige, signierte URL des eigenen Selfies oder null. */
  selfieUrl: string | null;
  /** Gewählte Antwort-IDs in der Reihenfolge der Fragen. */
  answers: string[];
}

export interface JoinResult {
  /** Sitzungstoken; das Handy speichert es und sendet es als Bearer-Token. */
  token: string;
  participant: ParticipantMe;
}
