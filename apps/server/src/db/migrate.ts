import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.ts";

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../drizzle");

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
