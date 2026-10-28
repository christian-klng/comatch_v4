// Simulierte teilnehmende Person für Bot-Skript und Lasttest: tritt bei, lädt ein einfarbiges
// Selfie hoch, bleibt per Socket.IO verbunden und bestätigt ihr Match nach einer Zufallszeit.
import { crc32, deflateSync } from "node:zlib";
import { io, type Socket } from "socket.io-client";
import type { ConfirmCodeResult, JoinResult, ParticipantLive, PublicEvent } from "@comatch/shared";

/** Einfarbiges PNG (270×360) ohne Bildbibliothek. */
export function solidPng(r: number, g: number, b: number, width = 270, height = 360): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 Bit, RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const COLORS = [
  [239, 68, 68],
  [34, 197, 94],
  [59, 130, 246],
  [234, 179, 8],
  [168, 85, 247],
  [20, 184, 166],
] as const;

export class HttpFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Gemeinsamer Zustand aller Bots eines Prozesses. */
export interface BotWorld {
  base: string;
  /** Eigene Codes aller Bots (participantId → Code der laufenden Runde). */
  codes: Map<string, string>;
  confirmDelayS: [number, number];
  notFoundRate: number;
  /** Messpunkte; im Bot-Skript für Log-Ausgaben, im Lasttest für Kennzahlen. */
  onEvent?: (event: BotEvent) => void;
}

export type BotEvent =
  | { type: "state"; bot: string; state: ParticipantLive; bytes: number }
  | { type: "request"; bot: string; name: string; ms: number; status: number }
  | { type: "confirm"; bot: string; code: string; result: ConfirmCodeResult["result"] }
  | { type: "not_found"; bot: string }
  | { type: "error"; bot: string; message: string }
  | { type: "invalid"; bot: string }
  | { type: "connect"; bot: string };

export async function request<T>(
  world: BotWorld,
  bot: string,
  name: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const started = performance.now();
  const res = await fetch(`${world.base}/api${path}`, init);
  world.onEvent?.({ type: "request", bot, name, ms: performance.now() - started, status: res.status });
  if (!res.ok) throw new HttpFailure(res.status, `${name}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface Bot {
  name: string;
  participantId: string;
  socket: Socket;
  stop(): void;
}

/** Tritt bei, lädt ein Selfie hoch und spielt mit, bis `stop()` aufgerufen wird. */
export async function startBot(world: BotWorld, ev: PublicEvent, index: number): Promise<Bot> {
  const name = `Bot ${index + 1}`;
  const answers = ev.questions.map((q) => q.options[Math.floor(Math.random() * q.options.length)]!.id);
  const { token, participant: me } = await request<JoinResult>(
    world,
    name,
    "join",
    `/events/${ev.slug}/join`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers, consent: true }),
    },
  );
  const [r, g, b] = COLORS[index % COLORS.length]!;
  await request(world, name, "selfie", `/participant/selfie`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "image/png" },
    body: new Uint8Array(solidPng(r, g, b)),
  });

  const post = <T>(label: string, path: string, body: unknown) =>
    request<T>(world, name, label, path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const socket = io(world.base, { auth: { role: "participant", token }, transports: ["websocket"] });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let plannedFor = "";
  let invalid = false;
  let stopped = false;

  const fail = (err: unknown) => {
    world.onEvent?.({ type: "error", bot: name, message: err instanceof Error ? err.message : String(err) });
    // Z. B. während einer Pause abgelehnt: beim nächsten Zustand neu planen.
    plannedFor = "";
  };

  /** Wählt den Code des Gegenübers: bekannt bei Bots, sonst geraten. */
  const act = async (state: ParticipantLive) => {
    if (stopped) return;
    const match = state.match!;
    if (Math.random() < world.notFoundRate && match.notFoundFrom !== null) {
      const wait = match.notFoundFrom - state.serverNow;
      if (wait > 0) return void (timer = setTimeout(() => void act(state).catch(fail), wait + 500));
      await post("not_found", `/participant/match/not-found`, { matchId: match.id });
      return world.onEvent?.({ type: "not_found", bot: name });
    }
    const known = world.codes.get(match.confirm.targetId);
    const options = match.confirm.options ?? [known ?? "123"];
    const code =
      known && options.includes(known) ? known : options[Math.floor(Math.random() * options.length)]!;
    const res = await post<ConfirmCodeResult>("confirm", `/participant/match/confirm`, {
      matchId: match.id,
      code,
    });
    world.onEvent?.({ type: "confirm", bot: name, code, result: res.result });
    // Falsch geraten: nach der Sperre nochmal.
    if (res.result === "wrong") timer = setTimeout(() => void act(res.state).catch(fail), 6_000);
  };

  socket.on("state", (s: ParticipantLive) => {
    world.onEvent?.({ type: "state", bot: name, state: s, bytes: JSON.stringify(s).length });
    if (s.match) world.codes.set(me.id, s.match.ownCode);

    // Neues offenes Match: nach einer zufälligen Suchzeit bestätigen.
    const open = s.clock.status === "running" && s.match?.status === "open" && !s.match.confirm.confirmed;
    const key = open ? `${s.match!.id}:${s.match!.confirm.targetId}` : "";
    if (key === plannedFor) return;
    clearTimeout(timer);
    plannedFor = key;
    if (!open || stopped) return;
    const [min, max] = world.confirmDelayS;
    timer = setTimeout(() => void act(s).catch(fail), (min + Math.random() * (max - min)) * 1000);
  });
  socket.on("connect", () => world.onEvent?.({ type: "connect", bot: name }));
  socket.on("session_invalid", () => {
    invalid = true;
    world.onEvent?.({ type: "invalid", bot: name });
  });
  // Wie im Browser: nach einer Trennung durch den Server selbst neu verbinden.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect" && !invalid && !stopped) setTimeout(() => socket.connect(), 2_000);
  });

  return {
    name,
    participantId: me.id,
    socket,
    stop() {
      stopped = true;
      clearTimeout(timer);
      socket.disconnect();
    },
  };
}
