// Simulierte Teilnehmende für lokale Tests:
//   npm run bots -w @comatch/server -- --event <code> --count 5 [--url http://localhost:5173]
//     [--confirm 8-40] [--not-found 0.1]
// Jeder Bot tritt bei, lädt ein einfarbiges Selfie hoch und bleibt per Socket.IO verbunden.
// Bei einem Match wählt er nach einer zufälligen Zeit (Sekunden) den Code des Gegenübers. Codes
// anderer Bots kennt er; bei echten Personen rät er (gut zum Testen der Fehlversuche).
// Mit --not-found drückt ein Teil der Bots stattdessen „Nicht gefunden“, sobald das geht.
// Für Messungen mit vielen Bots: scripts/loadtest.ts.
import { parseArgs } from "node:util";
import type { PublicEvent } from "@comatch/shared";
import { request, startBot, type BotWorld } from "./lib/bot.ts";

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

const last = new Map<string, string>();
const world: BotWorld = {
  base: values.url,
  codes: new Map(),
  confirmDelayS: values.confirm.split("-").map(Number) as [number, number],
  notFoundRate: Number(values["not-found"]),
  onEvent(e) {
    if (e.type === "state") {
      const s = e.state;
      const summary = s.match
        ? `Runde ${s.clock.round}: ${s.match.status === "confirmed" ? "bestätigt" : "Match"} mit ${s.match.partners.length} Person(en), Code ${s.match.ownCode}`
        : `${s.clock.status}, ${s.status}`;
      if (summary !== last.get(e.bot)) console.log(`${e.bot}: ${summary}`);
      last.set(e.bot, summary);
    } else if (e.type === "confirm") console.log(`${e.bot}: Code ${e.code} → ${e.result}`);
    else if (e.type === "not_found") console.log(`${e.bot}: Nicht gefunden`);
    else if (e.type === "error") console.log(`${e.bot}: ${e.message}`);
    else if (e.type === "invalid") console.log(`${e.bot}: Sitzung ungültig`);
  },
};

const ev = await request<PublicEvent>(world, "setup", "event", `/events/${values.event}`);
for (let i = 0; i < Number(values.count); i++) await startBot(world, ev, i);
console.log(`${values.count} Bots verbunden. Beenden mit Strg+C.`);
