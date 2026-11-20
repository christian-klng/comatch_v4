// Legt ein Admin-Konto an (z. B. das erste im Produktivbetrieb) oder setzt dessen Passwort neu.
//   node apps/server/src/db/create-admin.ts --email name@example.com [--account "Name"] [--reset]
// Mit --account kommt die Person in das Konto (den Mandanten) dieses Namens; es wird bei Bedarf
// angelegt. Ohne Angabe: das einzige vorhandene Konto, oder „Hauptkonto“ in einer leeren Datenbank.
// Das Passwort wird zufällig erzeugt und einmal ausgegeben. Weitere Admins lädt man danach in
// der Moderation unter „Team“ ein.
import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { normalizeEmail } from "../auth/session.ts";
import { hashPassword } from "../lib/password.ts";
import { randomToken } from "../lib/tokens.ts";
import { createDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { account, adminSession, adminUser } from "./schema.ts";
import type { Db } from "./client.ts";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    account: { type: "string" },
    reset: { type: "boolean", default: false },
  },
});
if (!values.email) throw new Error("Bitte --email angeben.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");

/** Konto für ein neues Admin-Konto; null, wenn bei mehreren Konten keins benannt ist. */
async function resolveAccount(db: Db, name: string | undefined): Promise<string | null> {
  const accounts = await db.select({ id: account.id, name: account.name }).from(account);
  if (!name && accounts.length > 1) return null;
  const wanted = name ?? accounts[0]?.name ?? "Hauptkonto";
  const existing = accounts.find((a) => a.name === wanted);
  if (existing) return existing.id;
  const [created] = await db
    .insert(account)
    .values({ name: wanted, legalFromOperator: true })
    .returning({ id: account.id });
  return created!.id;
}

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
    const accountId = await resolveAccount(db, values.account);
    if (!accountId) {
      console.error('Es gibt mehrere Konten. Bitte mit --account "Name" angeben, in welches.');
      process.exitCode = 1;
    } else {
      // Die erste Person eines Kontos wird Inhaber*in.
      const hasOwner =
        (await db.$count(adminUser, and(eq(adminUser.accountId, accountId), eq(adminUser.role, "owner")))) >
        0;
      await db.insert(adminUser).values({
        accountId,
        email,
        passwordHash: await hashPassword(password),
        role: hasOwner ? "member" : "owner",
        emailVerifiedAt: new Date(),
      });
    }
  }
  if (!process.exitCode) {
    console.log(`${existing ? "Neues Passwort für" : "Admin angelegt:"} ${email}`);
    console.log(`Passwort (nur jetzt sichtbar, bitte im Passwort-Manager speichern): ${password}`);
  }
} finally {
  await sql.end();
}
