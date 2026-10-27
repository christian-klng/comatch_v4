import { sql as rawSql } from "drizzle-orm";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { attachRealtime } from "./realtime/socket.ts";

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);

await runMigrations(db);

const app = await buildApp({
  logger:
    config.NODE_ENV === "development"
      ? { level: "info", transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } }
      : { level: "info" },
  pingDb: async () => {
    await db.execute(rawSql`select 1`);
  },
  webDistDir: config.WEB_DIST_DIR,
});

const io = attachRealtime(app.server);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} empfangen, fahre herunter …`);
  io.disconnectSockets(true);
  await app.close();
  await sql.end();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.API_PORT, host: config.HOST });
