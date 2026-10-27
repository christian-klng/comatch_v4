import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@comatch/shared";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Verbindet sich mit demselben Host, im Dev-Modus über den Vite-Proxy. */
export function connectSocket(): AppSocket {
  return io({ transports: ["websocket", "polling"] });
}
