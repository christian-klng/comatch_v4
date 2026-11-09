import { buildApp } from "./app.ts";
import { legalInfo, loadConfig, s3Options } from "./config.ts";
import { createDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { RETENTION_CHECK_MS, runRetention } from "./events/retention.ts";
import { createMediaSigner } from "./lib/media.ts";
import { randomToken } from "./lib/tokens.ts";
import { systemClock } from "./live/clock.ts";
import { LiveEvents } from "./live/runtime.ts";
import { attachRealtime } from "./realtime/socket.ts";
import { createPostgresStorage } from "./storage/postgres.ts";
import { createS3Storage } from "./storage/s3.ts";
import type { Storage } from "./storage/storage.ts";

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);

await runMigrations(db);

const s3 = s3Options(config);
let storage: Storage = createPostgresStorage(db);
if (s3) {
  const bucket = createS3Storage(s3);
  await bucket.ensureBucket();
  storage = bucket;
}

const media = createMediaSigner(config.MEDIA_SIGNING_SECRET ?? randomToken(32));
const live = new LiveEvents({ db, media, clock: systemClock });

/**
 * Anfragen ohne IP-Adresse und ohne Query loggen: Die Query kann Geheimnisse enthalten
 * (Presenter-Token, Signaturen von Bild-URLs), und IP-Adressen braucht der Betrieb nicht.
 */
const serializers = {
  req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url.split("?")[0] }),
};

const legal = legalInfo(config);
const retentionMs = config.RETENTION_HOURS * 60 * 60 * 1000;

const app = await buildApp({
  logger:
    config.NODE_ENV === "development"
      ? {
          level: "info",
          serializers,
          transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } },
        }
      : { level: "info", serializers },
  trustProxy: config.TRUST_PROXY,
  retentionMs,
  legal,
  db,
  storage,
  media,
  live,
  publicBaseUrl: config.PUBLIC_BASE_URL,
  cookieSecure: config.COOKIE_SECURE,
  webDistDir: config.WEB_DIST_DIR,
});

const io = attachRealtime(app.server, { db, live });
live.setLogger(app.log);
app.log.info(s3 ? `Selfies liegen im S3-Bucket ${s3.bucket}` : "Selfies liegen in der Datenbank");

// Beim Herunterfahren gebraucht, gesetzt erst nach dem Start (Signal kann vorher kommen).
const timers: { retention?: ReturnType<typeof setInterval> } = {};
const shutdown = async (signal: string) => {
  app.log.info(`${signal} empfangen, fahre herunter …`);
  clearInterval(timers.retention);
  live.stop();
  // Nur die Transporte schließen: Clients sehen einen Abbruch und verbinden sich nach dem
  // Neustart selbst neu. (disconnectSockets() würde das automatische Neuverbinden abschalten.)
  io.engine.close();
  await live.idle();
  await app.close();
  await sql.end();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.API_PORT, host: config.HOST });
// Laufende Events nach einem Neustart fortsetzen (Timer aus round_ends_at).
await live.restore();

if (config.NODE_ENV === "production" && !legal.configured) {
  app.log.warn(
    "LEGAL_NAME, LEGAL_ADDRESS und LEGAL_EMAIL fehlen: Impressum und Datenschutzerklärung sind unvollständig.",
  );
}

// Löschfristen: beim Start und danach regelmäßig prüfen.
const retention = async () => {
  try {
    const { ended, purged } = await runRetention({ db, storage, live, retentionMs });
    if (ended.length > 0) app.log.info({ events: ended }, "Vergessene Events beendet");
    if (purged.length > 0)
      app.log.info({ events: purged }, "Selfies und Sitzungen nach Ablauf der Frist gelöscht");
  } catch (err) {
    app.log.error({ err }, "Löschfrist-Prüfung fehlgeschlagen");
  }
};
await retention();
timers.retention = setInterval(() => void retention(), RETENTION_CHECK_MS);
timers.retention.unref();
