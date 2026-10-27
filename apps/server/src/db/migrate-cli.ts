import { loadConfig } from "../config.ts";
import { createDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);

try {
  await runMigrations(db);
  console.log("Migrationen angewendet.");
} finally {
  await sql.end();
}
