import { useEffect, useState } from "react";
import { estimateClockOffset, remainingMs, type SessionEndReason, type SocketAuth } from "@comatch/shared";
import { connectSocket } from "./socket.ts";

const RESYNC_MS = 15_000;

interface LiveConnection<T> {
  data: T | null;
  connected: boolean;
  /** Serverzeit − Clientzeit in ms. */
  offsetMs: number;
  /** Der Server hat die Sitzung abgelehnt (z. B. ausgestiegen oder entfernt), sonst null. */
  invalid: SessionEndReason | null;
}

/**
 * Hält eine Socket.IO-Verbindung mit Anmeldung und liefert den jeweils letzten Zustand.
 * Socket.IO verbindet sich nach Abbrüchen selbst neu; der Server schickt dann den vollen Zustand.
 */
export function useLive<T>(auth: SocketAuth | null, eventName: "state" | "event_state"): LiveConnection<T> {
  const [state, setState] = useState<LiveConnection<T>>({
    data: null,
    connected: false,
    offsetMs: 0,
    invalid: null,
  });
  const key = JSON.stringify(auth);

  useEffect(() => {
    if (!key || key === "null") return;
    const socket = connectSocket(JSON.parse(key) as SocketAuth);

    const sync = () => {
      const sentAt = Date.now();
      socket.emit("ping", ({ serverNow }) => {
        const offsetMs = Math.round(estimateClockOffset(sentAt, Date.now(), serverNow));
        setState((s) => ({ ...s, offsetMs }));
      });
    };
    socket.on("connect", () => {
      setState((s) => ({ ...s, connected: true }));
      sync();
    });
    let invalid = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    socket.on("disconnect", (reason) => {
      setState((s) => ({ ...s, connected: false }));
      // Nach einer Trennung durch den Server verbindet Socket.IO nicht selbst neu.
      if (reason === "io server disconnect" && !invalid) retry = setTimeout(() => socket.connect(), 2_000);
    });
    socket.on(eventName, (data: unknown) => setState((s) => ({ ...s, data: data as T })));
    socket.on("session_invalid", (payload) => {
      invalid = true;
      setState((s) => ({ ...s, invalid: payload?.reason ?? "unknown" }));
    });
    const interval = setInterval(sync, RESYNC_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(retry);
      socket.disconnect();
    };
  }, [key, eventName]);

  return state;
}

/** Verbleibende Zeit bis `endsAt` (Serverzeit), aktualisiert mehrmals pro Sekunde. */
export function useRemaining(endsAt: number | null, offsetMs: number): number | null {
  const compute = () => (endsAt === null ? null : remainingMs(endsAt, Date.now(), offsetMs));
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    const tick = () => setRemaining(endsAt === null ? null : remainingMs(endsAt, Date.now(), offsetMs));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [endsAt, offsetMs]);

  return remaining;
}

export function formatCountdown(ms: number | null): string {
  if (ms === null) return "–:––";
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
