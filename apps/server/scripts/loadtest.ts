// Lasttest: legt ein Event an, lässt N Bots beitreten und spielt einige Runden durch.
//   npm run loadtest -w @comatch/server -- [--url http://localhost:3000] [--count 200] [--rounds 3]
//     [--confirm 5-40] [--not-found 0.05] [--concurrency 25]
//     [--flaky] [--delay 200-800] [--drop 0.01]   schwaches WLAN: Verzögerung und Abbrüche
//     [--restart]                                 wartet nach Runde 1 auf einen Server-Neustart
// Braucht SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD (wie npm run db:seed) für das Admin-Konto.
// Misst: Dauer von Beitritt und Upload, Zeit bis alle Handys ihr Match haben, Antwortzeiten der
// Endpunkte, Fehler je Status, Datenmenge per Socket und die Event-Loop-Verzögerung des Servers.
import { parseArgs } from "node:util";
import type { EventDetail, EventStats, PublicEvent } from "@comatch/shared";
import { startBot, type Bot, type BotEvent, type BotWorld } from "./lib/bot.ts";
import { startFlakyProxy } from "./lib/flaky-proxy.ts";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    count: { type: "string", default: "200" },
    rounds: { type: "string", default: "3" },
    confirm: { type: "string", default: "5-40" },
    "not-found": { type: "string", default: "0.05" },
    concurrency: { type: "string", default: "25" },
    flaky: { type: "boolean", default: false },
    delay: { type: "string", default: "200-800" },
    drop: { type: "string", default: "0.01" },
    restart: { type: "boolean", default: false },
  },
});
const base = values.url;
const count = Number(values.count);
const rounds = Number(values.rounds);
const confirmDelayS = values.confirm.split("-").map(Number) as [number, number];
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password)
  throw new Error("SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD setzen (siehe .env.example).");

// ---------------------------------------------------------------------------
// Messwerte
// ---------------------------------------------------------------------------

const timings = new Map<string, number[]>();
const statuses = new Map<string, number>();
const errors = new Map<string, number>();
let stateMessages = 0;
let stateBytes = 0;
/** Wann welcher Bot zuerst ein Match der Runde n gesehen hat. */
const firstMatchAt = new Map<number, Map<string, number>>();
const confirmResults = new Map<string, number>();
/** Verbindungsaufbauten je Bot (der erste plus jede Wiederverbindung). */
const connects = new Map<string, number[]>();

const add = <K>(map: Map<K, number>, key: K, n = 1) => map.set(key, (map.get(key) ?? 0) + n);

function onEvent(e: BotEvent) {
  if (e.type === "request") {
    timings.set(e.name, [...(timings.get(e.name) ?? []), e.ms]);
    add(statuses, `${e.name} ${e.status}`);
  } else if (e.type === "state") {
    stateMessages++;
    stateBytes += e.bytes;
    const round = e.state.clock.round;
    if (e.state.match && e.state.clock.status === "running") {
      const seen = firstMatchAt.get(round) ?? new Map<string, number>();
      if (!seen.has(e.bot)) seen.set(e.bot, performance.now());
      firstMatchAt.set(round, seen);
    }
  } else if (e.type === "confirm") add(confirmResults, e.result);
  else if (e.type === "not_found") add(confirmResults, "not_found");
  else if (e.type === "connect") connects.set(e.bot, [...(connects.get(e.bot) ?? []), performance.now()]);
  else if (e.type === "error") add(errors, e.message.replace(/\{.*$/, "").trim());
}

const pct = (sorted: number[], p: number) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
const summary = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, p50: pct(s, 50), p95: pct(s, 95), max: s.at(-1) ?? 0 };
};
const ms = (n: number) => `${Math.round(n)} ms`;

// Event-Loop des Servers während des Tests beobachten.
const loopSamples: { p99: number; max: number; rssMb: number }[] = [];
const loopTimer = setInterval(() => {
  fetch(`${base}/api/health`)
    .then((r) => r.json() as Promise<{ eventLoop?: { p99Ms: number; maxMs: number }; rssMb?: number }>)
    .then((h) => {
      if (h.eventLoop)
        loopSamples.push({ p99: h.eventLoop.p99Ms, max: h.eventLoop.maxMs, rssMb: h.rssMb ?? 0 });
    })
    .catch(() => {});
}, 1_000);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Login fehlgeschlagen: ${login.status}`);
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");

async function admin<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}/api/admin${path}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const created = await admin<EventDetail>("POST", "/events", {
  title: `Lasttest ${new Date().toLocaleTimeString("de-DE")}`,
  startsAt: null,
});
await admin("PUT", `/events/${created.id}/status`, { status: "open" });
const ev = (await (await fetch(`${base}/api/events/${created.slug}`)).json()) as PublicEvent;
console.log(`Event ${created.slug} angelegt, ${count} Bots treten bei …`);

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

// Schwaches WLAN: Bots gehen über einen Proxy mit Verzögerung und Abbrüchen, Admin direkt.
const target = new URL(base);
const proxy = values.flaky
  ? await startFlakyProxy({
      target: { host: target.hostname, port: Number(target.port || 80) },
      delayMs: values.delay.split("-").map(Number) as [number, number],
      dropPerSecond: Number(values.drop),
    })
  : null;
if (proxy)
  console.log(`Schwaches WLAN über Proxy :${proxy.port} (${values.delay} ms, Abbruch ${values.drop}/s)`);

const world: BotWorld = {
  base: proxy ? `http://127.0.0.1:${proxy.port}` : base,
  codes: new Map(),
  confirmDelayS,
  notFoundRate: Number(values["not-found"]),
  onEvent,
};

const bots: Bot[] = [];
const joinStarted = performance.now();
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.concurrency) }, async () => {
    while (next < count) {
      const i = next++;
      const started = performance.now();
      try {
        bots.push(await startBot(world, ev, i));
        timings.set("join+selfie", [...(timings.get("join+selfie") ?? []), performance.now() - started]);
      } catch (err) {
        add(errors, `Beitritt: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      }
    }
  }),
);
const joinMs = performance.now() - joinStarted;
console.log(`${bots.length}/${count} beigetreten in ${ms(joinMs)}`);
await new Promise((r) => setTimeout(r, 2_000));
proxy?.setDropping(true);

const healthy = () =>
  fetch(`${base}/api/health`)
    .then((r) => r.ok)
    .catch(() => false);
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
let restartReport: Record<string, string | number> | null = null;

const roundLatency: { round: number; matched: number; p50: number; p95: number; max: number }[] = [];
const waitS = confirmDelayS[1] + 15;
for (let round = 1; round <= rounds; round++) {
  const t0 = performance.now();
  await admin("POST", `/events/${created.id}/control`, { action: round === 1 ? "start" : "next_round" });
  console.log(`Runde ${round} gestartet, warte ${waitS} s …`);
  await new Promise((r) => setTimeout(r, waitS * 1000));
  const seen = [...(firstMatchAt.get(round)?.values() ?? [])].map((t) => t - t0);
  roundLatency.push({ round, matched: seen.length, ...summary(seen) });

  if (values.restart && round === 1) {
    console.log("Jetzt den Server neu starten (warte auf Ausfall und Rückkehr) …");
    while (await healthy()) await sleep(200);
    const down = performance.now();
    while (!(await healthy())) await sleep(200);
    const up = performance.now();
    console.log(`Server war ${ms(up - down)} weg, warte auf die Bots …`);
    await sleep(15_000);
    const back = [...connects.values()]
      .map((list) => list.find((t) => t > down))
      .filter((t) => t !== undefined);
    const after = summary(back.map((t) => t - up));
    restartReport = {
      "Server weg": ms(up - down),
      "wieder verbunden": `${back.length}/${bots.length}`,
      "Wiederverbindung p50 (ab Rückkehr)": ms(after.p50),
      "Wiederverbindung max": ms(after.max),
      "Runde danach": (await admin<EventDetail>("GET", `/events/${created.id}`)).status,
    };
  }
}

const stats = await admin<EventStats>("GET", `/events/${created.id}/stats`);
await admin("POST", `/events/${created.id}/control`, { action: "end" });
bots.forEach((b) => b.stop());
clearInterval(loopTimer);
await proxy?.close();

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

console.log("\n== Antwortzeiten ==");
console.table(
  Object.fromEntries(
    [...timings].map(([name, list]) => {
      const s = summary(list);
      return [name, { n: s.n, p50: ms(s.p50), p95: ms(s.p95), max: ms(s.max) }];
    }),
  ),
);
console.log("== HTTP-Status ==");
console.table(Object.fromEntries(statuses));
console.log("== Zeit vom Rundenstart bis zum Match auf dem Handy ==");
console.table(
  roundLatency.map((r) => ({
    Runde: r.round,
    Handys: r.matched,
    p50: ms(r.p50),
    p95: ms(r.p95),
    max: ms(r.max),
  })),
);
console.log("== Bestätigungen ==");
console.table(Object.fromEntries(confirmResults));
if (errors.size > 0) {
  console.log("== Fehler ==");
  console.table(Object.fromEntries(errors));
}
const loop = summary(loopSamples.map((s) => s.p99));
console.log("== Server ==");
console.table({
  "Beitritt gesamt": ms(joinMs),
  "Socket-Nachrichten": stateMessages,
  "Socket-Daten": `${(stateBytes / 1024 / 1024).toFixed(1)} MB`,
  "Event-Loop p99 (Median der Messungen)": ms(loop.p50),
  "Event-Loop p99 (schlechteste Messung)": ms(loop.max),
  "Event-Loop max": ms(Math.max(0, ...loopSamples.map((s) => s.max))),
  "RSS max": `${Math.max(0, ...loopSamples.map((s) => s.rssMb))} MB`,
});
if (proxy) {
  const reconnects = [...connects.values()].map((list) => list.length - 1);
  console.log("== Schwaches WLAN ==");
  console.table({
    "Abbrüche durch den Proxy": proxy.drops(),
    "Wiederverbindungen gesamt": reconnects.reduce((a, b) => a + b, 0),
    "Bots mit Wiederverbindung": reconnects.filter((n) => n > 0).length,
  });
}
if (restartReport) {
  console.log("== Neustart ==");
  console.table(restartReport);
}
console.log("== Fairness ==");
console.table({
  Teilnehmende: stats.participants,
  "bestätigte Matches": stats.matches.confirmed,
  Bestätigungsquote: `${Math.round((stats.matches.confirmationRate ?? 0) * 100)} %`,
  "Ø Matches pro Person": stats.perPerson.average.toFixed(2),
  "ohne bestätigtes Match": stats.perPerson.withoutMatch,
});
process.exit(0);
