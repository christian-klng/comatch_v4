import { z } from "zod";
import type { EventStatus, MatchGroupKind, ParticipantStatus } from "./domain.ts";

/** Wer so lange keine Verbindung hatte, gilt als inaktiv und wird nicht mehr gepaart. */
export const INACTIVE_AFTER_MS = 60_000;

/** Kurz vor Rundenende lohnt kein neues Match mehr; Wartende kommen in die nächste Runde. */
export const POOL_CUTOFF_MS = 60_000;

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
  match: {
    id: string;
    kind: MatchGroupKind;
    /** Eigener Code, den das Gegenüber auswählen muss. */
    ownCode: string;
    /** Übereinstimmung 0–1. */
    similarity: number;
    partners: { id: string; selfieUrl: string | null }[];
  } | null;
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
}
