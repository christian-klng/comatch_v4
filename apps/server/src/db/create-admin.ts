// Legt ein Admin-Konto an (z. B. das erste im Produktivbetrieb) oder setzt dessen Passwort neu.
//   node apps/server/src/db/create-admin.ts --email name@example.com [--reset]
// Das Passwort wird zufällig erzeugt und einmal ausgegeben. Weitere Admins lädt man danach in
// der Moderation unter „Team“ ein.
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { normalizeEmail } from "../auth/session.ts";
import { hashPassword } from "../lib/password.ts";
import { randomToken } from "../lib/tokens.ts";
import { createDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { adminSession, adminUser } from "./schema.ts";

const { values } = parseArgs({
  options: { email: { type: "string" }, reset: { type: "boolean", default: false } },
});
if (!values.email) throw new Error("Bitte --email angeben.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");

const email = normalizeEmail(values.email);
const password = randomToken(12);
const { db, sql } = createDb(process.env.DATABASE_URL);

try {
  await runMigrations(db);
  const existing = await db.query.adminUser.findFirst({ where: eq(adminUser.email, email) });
  if (existing && !values.reset) {
    console.error(`${email} gibt es schon. Mit --reset bekommt das Konto ein neues Passwort.`);
    process.exitCode = 1;
  } else if (existing) {
    await db
      .update(adminUser)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(adminUser.id, existing.id));
    // Wer mit dem alten Passwort angemeldet war, fliegt raus.
    await db.delete(adminSession).where(eq(adminSession.adminId, existing.id));
  } else {
    await db.insert(adminUser).values({ email, passwordHash: await hashPassword(password) });
  }
  if (!process.exitCode) {
    console.log(`${existing ? "Neues Passwort für" : "Admin angelegt:"} ${email}`);
    console.log(`Passwort (nur jetzt sichtbar, bitte im Passwort-Manager speichern): ${password}`);
  }
} finally {
  await sql.end();
}
