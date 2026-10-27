import { useEffect, useState } from "react";
import { estimateClockOffset } from "@comatch/shared";
import { connectSocket } from "./socket.ts";

export interface ServerClock {
  connected: boolean;
  /** Offset in ms (Serverzeit − Clientzeit), null bis zur ersten Messung. */
  offsetMs: number | null;
}

export function useServerClock(): ServerClock {
  const [state, setState] = useState<ServerClock>({ connected: false, offsetMs: null });

  useEffect(() => {
    const socket = connectSocket();
    const measure = () => {
      const sentAt = Date.now();
      socket.emit("ping", ({ serverNow }) => {
        setState({
          connected: true,
          offsetMs: Math.round(estimateClockOffset(sentAt, Date.now(), serverNow)),
        });
      });
    };
    socket.on("connect", measure);
    socket.on("disconnect", () => setState((s) => ({ ...s, connected: false })));
    const interval = setInterval(measure, 15_000);
    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  return state;
}
