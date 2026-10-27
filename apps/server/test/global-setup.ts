import postgres from "postgres";
import { createDb } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { TEST_DATABASE_URL } from "./db-url.ts";

/** Legt die Test-Datenbank an (falls nötig) und spielt die Migrationen ein. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (!exists) await admin.unsafe(`create database "${dbName}"`);
  } catch (err) {
    throw new Error(`Test-Datenbank nicht erreichbar (${adminUrl.host}). Läuft Postgres? → npm run db:up`, {
      cause: err,
    });
  } finally {
    await admin.end();
  }

  const { db, sql } = createDb(TEST_DATABASE_URL);
  try {
    await runMigrations(db);
  } finally {
    await sql.end();
  }
}
