import type { Server as HttpServer } from "node:http";
import { eq } from "drizzle-orm";
import { Server, type Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionEndReason,
  SocketAuth,
} from "@comatch/shared";
import { SESSION_COOKIE, findAdminBySession } from "../auth/session.ts";
import type { Db } from "../db/client.ts";
import { event, participant } from "../db/schema.ts";
import { sha256 } from "../lib/tokens.ts";
import type { Emitter, LiveEvents } from "../live/runtime.ts";

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export const rooms = {
  participant: (id: string) => `participant:${id}`,
  presenter: (eventId: string) => `event:${eventId}:presenter`,
  admin: (eventId: string) => `event:${eventId}:admin`,
};

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function socketEmitter(io: RealtimeServer): Emitter {
  return {
    toParticipant: (id, state) => io.to(rooms.participant(id)).emit("state", state),
    toEvent: (eventId, state) =>
      io.to([rooms.presenter(eventId), rooms.admin(eventId)]).emit("event_state", state),
    invalidate: (id, reason) => io.to(rooms.participant(id)).emit("session_invalid", { reason }),
  };
}

/** Anmeldung abgelehnt: Der Client erfährt es und versucht es nicht erneut. */
function reject(socket: AppSocket, reason: SessionEndReason = "unknown") {
  socket.emit("session_invalid", { reason });
  socket.disconnect(true);
}

/** Ordnet eine neue Verbindung anhand ihrer Anmeldung einem Room zu. */
async function handleConnection(socket: AppSocket, db: Db, live: LiveEvents) {
  const auth = (socket.handshake.auth ?? {}) as SocketAuth;

  if ("role" in auth && auth.role === "participant") {
    const row = await db.query.participant.findFirst({
      where: eq(participant.sessionTokenHash, sha256(String(auth.token))),
      columns: { id: true, eventId: true, status: true },
    });
    if (!row) return reject(socket);
    if (row.status === "removed") return reject(socket, "removed");
    // Schon wieder weg, während wir in der DB nachgesehen haben: nicht als verbunden zählen.
    if (socket.disconnected) return;
    socket.on("disconnect", () => void live.disconnect(row.id, row.eventId));
    await socket.join(rooms.participant(row.id));
    await live.connect(row.id, row.eventId);
    return;
  }

  if ("role" in auth && auth.role === "presenter") {
    const ev = await db.query.event.findFirst({
      where: eq(event.id, String(auth.eventId)),
      columns: { id: true, presenterToken: true },
    });
    if (!ev || ev.presenterToken !== auth.token) return reject(socket);
    await socket.join(rooms.presenter(ev.id));
    const state = await live.eventState(ev.id);
    if (state) socket.emit("event_state", state);
    return;
  }

  if ("role" in auth && auth.role === "admin") {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const admin = token ? await findAdminBySession(db, token) : null;
    const state = admin ? await live.eventState(String(auth.eventId)) : null;
    if (!state) return reject(socket);
    await socket.join(rooms.admin(String(auth.eventId)));
    socket.emit("event_state", state);
  }
  // Ohne Rolle (z. B. Statusseite): nur Zeit-Synchronisation.
}

export function attachRealtime(httpServer: HttpServer, deps: { db: Db; live: LiveEvents }): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    // Kurze Intervalle, damit Verbindungsabbrüche im Event-WLAN schnell erkannt werden.
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  io.on("connection", (socket) => {
    socket.emit("hello", { serverNow: Date.now() });
    socket.on("ping", (ack) => ack({ serverNow: Date.now() }));
    handleConnection(socket, deps.db, deps.live).catch(() => socket.disconnect(true));
  });

  deps.live.attach(socketEmitter(io));
  return io;
}
