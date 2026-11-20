// Plattform-Verwaltung für den Betreiber: Konten ansehen, sperren, Grenzen ändern.
//   npm run accounts -w @comatch/server -- list
//   npm run accounts -w @comatch/server -- suspend <konto>
//   npm run accounts -w @comatch/server -- unsuspend <konto>
//   npm run accounts -w @comatch/server -- limits <konto> [--live 5] [--participants 200]
// <konto> ist die ID des Kontos oder die E-Mail einer Person darin.
import { parseArgs } from "node:util";
import { desc, eq, sql } from "drizzle-orm";
import { MAX_PARTICIPANTS_PER_EVENT } from "@comatch/shared";
import { normalizeEmail } from "../auth/session.ts";
import { createDb, type Db } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { account, adminUser, event } from "./schema.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { live: { type: "string" }, participants: { type: "string" } },
});
const [command, ref] = positionals;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findAccount(db: Db, value: string | undefined) {
  if (!value) throw new Error("Bitte das Konto angeben: ID oder E-Mail einer Person darin.");
  let id = value;
  if (!UUID.test(value)) {
    const admin = await db.query.adminUser.findFirst({
      where: eq(adminUser.email, normalizeEmail(value)),
      columns: { accountId: true },
    });
    if (!admin) throw new Error(`Zu ${value} gibt es kein Konto.`);
    id = admin.accountId;
  }
  const row = await db.query.account.findFirst({ where: eq(account.id, id) });
  if (!row) throw new Error(`Konto ${id} nicht gefunden.`);
  return row;
}

function limit(name: string, raw: string | undefined, max: number): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`--${name}: ganze Zahl von 1 bis ${max}.`);
  return n;
}

async function list(db: Db) {
  const rows = await db
    .select({
      id: account.id,
      name: account.name,
      status: account.status,
      maxLiveEvents: account.maxLiveEvents,
      maxParticipants: account.maxParticipants,
      createdAt: account.createdAt,
      // Tabellen ausgeschrieben: In Unterabfragen setzt Drizzle die Spalten ohne Tabellennamen ein.
      owner: sql<string | null>`(select u.email from admin_user u
        where u.account_id = "account"."id" and u.role = 'owner' limit 1)`,
      members: db.$count(adminUser, eq(adminUser.accountId, account.id)),
      events: db.$count(event, eq(event.accountId, account.id)),
      live: sql<number>`(select count(*)::int from event e
        where e.account_id = "account"."id" and e.status in ('running', 'paused'))`,
      lastEvent: sql<string | null>`(select max(e.created_at)::text from event e
        where e.account_id = "account"."id")`,
    })
    .from(account)
    .orderBy(desc(account.createdAt));
  const day = (value: Date | string | null) => (value ? new Date(value).toISOString().slice(0, 10) : "–");
  console.table(
    rows.map((r) => ({
      Konto: r.name,
      "Inhaber*in": r.owner ?? "–",
      Status: r.status === "active" ? "aktiv" : "gesperrt",
      Personen: r.members,
      Events: r.events,
      "laufen gerade": `${r.live} von ${r.maxLiveEvents}`,
      "max. Teilnehmende": r.maxParticipants,
      "angelegt am": day(r.createdAt),
      "letztes Event": day(r.lastEvent),
      ID: r.id,
    })),
  );
}

const { db, sql: connection } = createDb(process.env.DATABASE_URL);
try {
  await runMigrations(db);
  if (command === "list") {
    await list(db);
  } else if (command === "suspend" || command === "unsuspend") {
    const row = await findAccount(db, ref);
    const status = command === "suspend" ? "suspended" : "active";
    await db.update(account).set({ status }).where(eq(account.id, row.id));
    console.log(
      status === "suspended"
        ? `„${row.name}“ ist gesperrt: kein Login, kein Beitritt zu den Events. Laufende Events laufen weiter, bis sie jemand beendet.`
        : `„${row.name}“ ist wieder aktiv.`,
    );
  } else if (command === "limits") {
    const row = await findAccount(db, ref);
    const maxLiveEvents = limit("live", values.live, 100);
    const maxParticipants = limit("participants", values.participants, MAX_PARTICIPANTS_PER_EVENT);
    if (maxLiveEvents !== undefined || maxParticipants !== undefined) {
      await db
        .update(account)
        .set({
          maxLiveEvents: maxLiveEvents ?? row.maxLiveEvents,
          maxParticipants: maxParticipants ?? row.maxParticipants,
        })
        .where(eq(account.id, row.id));
    }
    console.log(
      `„${row.name}“: ${maxLiveEvents ?? row.maxLiveEvents} Events gleichzeitig, ` +
        `${maxParticipants ?? row.maxParticipants} Teilnehmende je Event.`,
    );
  } else {
    console.error(
      "Befehle: list | suspend <konto> | unsuspend <konto> | limits <konto> [--live n] [--participants n]",
    );
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await connection.end();
}
