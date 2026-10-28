import type { EventLive, ParticipantLive } from "./live.ts";

/** Warum eine Sitzung endet: unbekannt (abgelaufen, ausgestiegen) oder von der Moderation entfernt. */
export type SessionEndReason = "unknown" | "removed";

export interface ServerHello {
  /** Serverzeit in ms seit Epoch, zur Berechnung des Uhren-Offsets. */
  serverNow: number;
}

/** Anmeldung beim Verbindungsaufbau (Socket.IO `auth`). Admins nutzen zusätzlich ihr Cookie. */
export type SocketAuth =
  | { role: "participant"; token: string }
  | { role: "presenter"; eventId: string; token: string }
  | { role: "admin"; eventId: string }
  | Record<string, never>;

export interface ServerToClientEvents {
  hello: (payload: ServerHello) => void;
  /** Kompletter Zustand für das Handy; kommt bei jeder Änderung. */
  state: (payload: ParticipantLive) => void;
  /** Zustand für Leinwand und Admins. */
  event_state: (payload: EventLive) => void;
  /** Die Sitzung ist ungültig (z. B. ausgestiegen oder von der Moderation entfernt). */
  session_invalid: (payload?: { reason: SessionEndReason }) => void;
}

export interface ClientToServerEvents {
  /** Antwortet mit der aktuellen Serverzeit (für wiederholte Zeit-Synchronisation). */
  ping: (ack: (payload: ServerHello) => void) => void;
}
