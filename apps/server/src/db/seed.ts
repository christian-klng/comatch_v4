// Legt ein lokales Admin-Konto und ein Demo-Event an. Mehrfach ausführbar.
import { eq } from "drizzle-orm";
import { eventSettingsInput, type EventSettingsInput } from "@comatch/shared";
import { loadConfig } from "../config.ts";
import { hashPassword } from "../lib/password.ts";
import { createDb, type Db } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { adminUser, answerOption, event, optionComplement, question } from "./schema.ts";

const DEMO_SLUG = "demo";

const demoSettings: EventSettingsInput = eventSettingsInput.parse({
  title: "Demo Founders Night",
  questions: [
    {
      text: "In welcher Phase ist dein Startup?",
      matchMode: "same",
      options: [{ label: "Idee" }, { label: "Pre-Seed" }, { label: "Seed" }, { label: "Series A+" }],
    },
    {
      text: "Was bringst du mit?",
      matchMode: "complementary",
      options: [
        { label: "Tech", complements: [1] },
        { label: "Business", complements: [0, 2] },
        { label: "Design", complements: [1] },
      ],
    },
    {
      text: "Welche Branche?",
      matchMode: "same",
      options: [{ label: "Climate" }, { label: "Health" }, { label: "Fintech" }, { label: "Andere" }],
    },
  ],
});

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

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(event)
      .values({
        slug: DEMO_SLUG,
        title: demoSettings.title,
        roundDurationS: demoSettings.roundDurationS,
        firstMatchDelayS: demoSettings.firstMatchDelayS,
        createdBy,
      })
      .returning();

    for (const [qIndex, q] of demoSettings.questions.entries()) {
      const [createdQuestion] = await tx
        .insert(question)
        .values({
          eventId: created!.id,
          position: qIndex + 1,
          text: q.text,
          matchMode: q.matchMode,
          weight: q.weight,
        })
        .returning();

      const options = await tx
        .insert(answerOption)
        .values(
          q.options.map((o, oIndex) => ({
            questionId: createdQuestion!.id,
            position: oIndex + 1,
            label: o.label,
          })),
        )
        .returning();

      const complements = q.options.flatMap((o, oIndex) =>
        o.complements.map((target) => ({
          optionId: options[oIndex]!.id,
          complementOptionId: options[target]!.id,
        })),
      );
      if (complements.length > 0) await tx.insert(optionComplement).values(complements);
    }
    return created!;
  });
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
  const admin = await seedAdmin(db, email, password);
  const demo = await seedDemoEvent(db, admin.id);
  console.log(`Admin: ${admin.email}`);
  console.log(`Demo-Event: ${demo.title} → ${config.PUBLIC_BASE_URL}/e/${demo.slug}`);
} finally {
  await sql.end();
}
