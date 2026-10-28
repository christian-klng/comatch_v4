// Simulierte Teilnehmende für lokale Tests (später Grundlage für den Lasttest):
//   npm run bots -w @comatch/server -- --event <code> --count 5 [--url http://localhost:5173]
//     [--confirm 8-40] [--not-found 0.1]
// Jeder Bot tritt bei, lädt ein einfarbiges Selfie hoch und bleibt per Socket.IO verbunden.
// Bei einem Match wählt er nach einer zufälligen Zeit (Sekunden) den Code des Gegenübers. Codes
// anderer Bots kennt er; bei echten Personen rät er (gut zum Testen der Fehlversuche).
// Mit --not-found drückt ein Teil der Bots stattdessen „Nicht gefunden“, sobald das geht.
import { parseArgs } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import { io } from "socket.io-client";
import type { ConfirmCodeResult, JoinResult, ParticipantLive, PublicEvent } from "@comatch/shared";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:5173" },
    event: { type: "string" },
    count: { type: "string", default: "5" },
    confirm: { type: "string", default: "8-40" },
    "not-found": { type: "string", default: "0" },
  },
});
if (!values.event) throw new Error("Bitte --event <code> angeben.");
const base = values.url;
const [confirmMin, confirmMax] = values.confirm.split("-").map(Number) as [number, number];
const notFoundRate = Number(values["not-found"]);
/** Eigene Codes aller Bots dieses Prozesses (participantId → Code der laufenden Runde). */
const botCodes = new Map<string, string>();

/** Einfarbiges PNG (270×360) ohne Bildbibliothek. */
function solidPng(r: number, g: number, b: number, width = 270, height = 360): Buffer {
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}/api${path}`, init);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const post = <T>(path: string, token: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const ev = await request<PublicEvent>(`/events/${values.event}`);
const colors = [
  [239, 68, 68],
  [34, 197, 94],
  [59, 130, 246],
  [234, 179, 8],
  [168, 85, 247],
  [20, 184, 166],
];

for (let i = 0; i < Number(values.count); i++) {
  const name = `Bot ${i + 1}`;
  const answers = ev.questions.map((q) => q.options[Math.floor(Math.random() * q.options.length)]!.id);
  const { token, participant: me } = await request<JoinResult>(`/events/${values.event}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers, consent: true }),
  });
  const [r, g, b] = colors[i % colors.length]!;
  await request(`/participant/selfie`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "image/png" },
    body: new Uint8Array(solidPng(r!, g!, b!)),
  });

  const socket = io(base, { auth: { role: "participant", token }, transports: ["websocket"] });
  let last = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let plannedFor = "";

  /** Wählt den Code des Gegenübers: bekannt bei Bots, sonst geraten. */
  const act = async (state: ParticipantLive) => {
    const match = state.match!;
    const giveUp = Math.random() < notFoundRate;
    if (giveUp && match.notFoundFrom !== null) {
      const wait = match.notFoundFrom - state.serverNow;
      if (wait > 0) return void (timer = setTimeout(() => void act(state), wait + 500));
      await post(`/participant/match/not-found`, token, { matchId: match.id });
      return console.log(`${name}: Nicht gefunden`);
    }
    const known = botCodes.get(match.confirm.targetId);
    const options = match.confirm.options ?? [known ?? "123"];
    const code =
      known && options.includes(known) ? known : options[Math.floor(Math.random() * options.length)]!;
    const res = await post<ConfirmCodeResult>(`/participant/match/confirm`, token, {
      matchId: match.id,
      code,
    });
    console.log(`${name}: Code ${code} → ${res.result}`);
    // Falsch geraten: nach der Sperre nochmal.
    if (res.result === "wrong") timer = setTimeout(() => void act(res.state).catch(log), 6_000);
  };
  const log = (err: unknown) => console.log(`${name}: ${err instanceof Error ? err.message : String(err)}`);

  socket.on("state", (s: ParticipantLive) => {
    if (s.match) botCodes.set(me.id, s.match.ownCode);
    const summary = s.match
      ? `Runde ${s.clock.round}: ${s.match.status === "confirmed" ? "bestätigt" : "Match"} mit ${s.match.partners.length} Person(en), Code ${s.match.ownCode}`
      : `${s.clock.status}, ${s.status}`;
    if (summary !== last) console.log(`${name}: ${summary}`);
    last = summary;

    // Neues offenes Match: nach einer zufälligen Suchzeit bestätigen.
    const open = s.clock.status === "running" && s.match?.status === "open" && !s.match.confirm.confirmed;
    const key = open ? `${s.match!.id}:${s.match!.confirm.targetId}` : "";
    if (key === plannedFor) return;
    clearTimeout(timer);
    plannedFor = key;
    if (!open) return;
    const delay = (confirmMin + Math.random() * (confirmMax - confirmMin)) * 1000;
    timer = setTimeout(() => void act(s).catch(log), delay);
  });
  let invalid = false;
  socket.on("session_invalid", () => {
    invalid = true;
    console.log(`${name}: Sitzung ungültig`);
  });
  // Wie im Browser: nach einer Trennung durch den Server selbst neu verbinden.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect" && !invalid) setTimeout(() => socket.connect(), 2_000);
  });
}
console.log(`${values.count} Bots verbunden. Beenden mit Strg+C.`);
