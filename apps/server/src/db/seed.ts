// Legt ein lokales Admin-Konto und ein Demo-Event an. Mehrfach ausführbar.
import { eq } from "drizzle-orm";
import { DEFAULT_QUESTIONS } from "@comatch/shared";
import { normalizeEmail } from "../auth/session.ts";
import { loadConfig } from "../config.ts";
import { createEvent } from "../events/service.ts";
import { hashPassword } from "../lib/password.ts";
import { createDb, type Db } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { adminUser, event } from "./schema.ts";

const DEMO_SLUG = "demo";

async function seedAdmin(db: Db, email: string, password: string) {
  const existing = await db.query.adminUser.findFirst({ where: eq(adminUser.email, email) });
  if (existing) return existing;
  const [created] = await db
    .insert(adminUser)
    .values({ email, passwordHash: await hashPassword(password) })
    .returning();
  return created!;
}

async function seedDemoEvent(db: Db, createdBy: string) {
  const existing = await db.query.event.findFirst({ where: eq(event.slug, DEMO_SLUG) });
  if (existing) return existing;
  const id = await createEvent(
    db,
    { title: "Demo Founders Night", startsAt: null, slug: DEMO_SLUG },
    createdBy,
    DEFAULT_QUESTIONS,
  );
  return (await db.query.event.findFirst({ where: eq(event.id, id) }))!;
}

const config = loadConfig();
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error("SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD müssen gesetzt sein (siehe .env.example).");
}

const { db, sql } = createDb(config.DATABASE_URL);
try {
  await runMigrations(db);
  const admin = await seedAdmin(db, normalizeEmail(email), password);
  const demo = await seedDemoEvent(db, admin.id);
  console.log(`Admin: ${admin.email}`);
  console.log(`Demo-Event: ${demo.title} → ${config.PUBLIC_BASE_URL}/e/${demo.slug}`);
} finally {
  await sql.end();
}
