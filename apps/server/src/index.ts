import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { createMediaSigner } from "./lib/media.ts";
import { randomToken } from "./lib/tokens.ts";
import { systemClock } from "./live/clock.ts";
import { LiveEvents } from "./live/runtime.ts";
import { attachRealtime } from "./realtime/socket.ts";
import { createS3Storage } from "./storage/s3.ts";

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);

await runMigrations(db);

const storage = createS3Storage({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
});
await storage.ensureBucket();

const media = createMediaSigner(config.MEDIA_SIGNING_SECRET ?? randomToken(32));
const live = new LiveEvents({ db, media, clock: systemClock });

const app = await buildApp({
  logger:
    config.NODE_ENV === "development"
      ? { level: "info", transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } }
      : { level: "info" },
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

const shutdown = async (signal: string) => {
  app.log.info(`${signal} empfangen, fahre herunter …`);
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
