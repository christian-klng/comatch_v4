import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { io as connectClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { EventLive, ParticipantLive } from "@comatch/shared";
import { event, participant } from "../db/schema.ts";
import { randomToken, sha256 } from "../lib/tokens.ts";
import { useTestApp } from "../../test/helpers.ts";
import { attachRealtime, type RealtimeServer } from "./socket.ts";

const t = useTestApp();
let io: RealtimeServer;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  const app = await t.app();
  await app.listen({ port: 0, host: "127.0.0.1" });
  io = attachRealtime(app.server, { db: t.db, live: t.live });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterEach(() => {
  sockets.splice(0).forEach((s) => s.disconnect());
});

afterAll(() => {
  io.disconnectSockets(true);
});

function connect(auth: object, headers?: Record<string, string>) {
  const socket = connectClient(url, {
    auth,
    transports: ["websocket"],
    forceNew: true,
    extraHeaders: headers,
  });
  sockets.push(socket);
  return socket;
}

const next = <T>(socket: Socket, name: string) => new Promise<T>((resolve) => socket.once(name, resolve));

async function readyParticipant(eventId: string) {
  const token = randomToken();
  const [row] = await t.db
    .insert(participant)
    .values({
      eventId,
      sessionTokenHash: sha256(token),
      status: "pool",
      poolSince: new Date(),
      selfieKey: "k.jpg",
    })
    .returning({ id: participant.id });
  return { id: row!.id, token };
}

describe("Socket.IO", () => {
  it("schickt dem Handy seinen Zustand und Änderungen per Push", async () => {
    const { id: eventId } = await t.createEvent("open");
    const a = await readyParticipant(eventId);
    await readyParticipant(eventId);

    const socket = connect({ role: "participant", token: a.token });
    const first = await next<ParticipantLive>(socket, "state");
    expect(first).toMatchObject({ status: "pool", clock: { status: "open", round: 0 }, match: null });

    const update = next<ParticipantLive>(socket, "state");
    await t.live.control(eventId, "start");
    expect(await update).toMatchObject({ status: "matched", clock: { status: "running", round: 1 } });
  });

  it("weist ungültige Sitzungen ab", async () => {
    const socket = connect({ role: "participant", token: "falsch" });
    const invalid = next(socket, "session_invalid");
    const closed = next(socket, "disconnect");
    await Promise.all([invalid, closed]);
  });

  it("lässt die Leinwand nur mit gültigem Präsentations-Token zu", async () => {
    const { id: eventId } = await t.createEvent("open");
    const [{ presenterToken }] = (await t.db
      .select({ presenterToken: event.presenterToken })
      .from(event)
      .where(eq(event.id, eventId))) as [{ presenterToken: string }];

    const ok = connect({ role: "presenter", eventId, token: presenterToken });
    expect(await next<EventLive>(ok, "event_state")).toMatchObject({ clock: { status: "open" } });

    const wrong = connect({ role: "presenter", eventId, token: "falsch" });
    await next(wrong, "disconnect");
  });

  it("lässt Admins nur mit gültigem Session-Cookie zu", async () => {
    const { id: eventId } = await t.createEvent("open");
    const { cookie } = await t.loginAs();

    const admin = connect({ role: "admin", eventId }, { cookie });
    expect(await next<EventLive>(admin, "event_state")).toMatchObject({ counts: { joined: 0 } });

    const anonymous = connect({ role: "admin", eventId });
    await next(anonymous, "disconnect");
  });
});
