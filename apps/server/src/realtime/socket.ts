import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@comatch/shared";

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function attachRealtime(httpServer: HttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    // Kurze Intervalle, damit Verbindungsabbrüche im Event-WLAN schnell erkannt werden.
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  io.on("connection", (socket) => {
    socket.emit("hello", { serverNow: Date.now() });
    socket.on("ping", (ack) => ack({ serverNow: Date.now() }));
  });

  return io;
}
