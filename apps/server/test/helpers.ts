import { sql as rawSql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  DEFAULT_QUESTIONS,
  type EventLive,
  type EventStatus,
  type LegalInfo,
  type ParticipantLive,
} from "@comatch/shared";
import { buildApp } from "../src/app.ts";
import { createDb } from "../src/db/client.ts";
import { account, adminUser, event } from "../src/db/schema.ts";
import { createEvent } from "../src/events/service.ts";
import { createMediaSigner } from "../src/lib/media.ts";
import { createMemoryMailer } from "../src/mail/mailer.ts";
import { createManualClock } from "../src/live/clock.ts";
import { LiveEvents, type Emitter } from "../src/live/runtime.ts";
import { hashPassword } from "../src/lib/password.ts";
import { createMemoryStorage } from "../src/storage/storage.ts";
import { TEST_DATABASE_URL } from "./db-url.ts";

export const PUBLIC_BASE_URL = "http://comatch.test";
export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const TEST_LEGAL: LegalInfo = {
  configured: true,
  name: "Test GmbH",
  address: "Teststraße 1, 12345 Berlin",
  email: "kontakt@comatch.test",
  phone: null,
  dpo: null,
  retentionHours: 24,
};

/**
 * Baut eine App gegen die Test-Datenbank und leert vor jedem Test alle Tabellen.
 * In einer Testdatei auf oberster Ebene aufrufen.
 */
/** Zähler für die Absender-Adressen der Test-Logins (siehe loginAs). */
let loginCount = 0;

export function useTestApp(options: { signupOpen?: boolean } = {}) {
  const { db, sql } = createDb(TEST_DATABASE_URL);
  const storage = createMemoryStorage();
  const media = createMediaSigner("test-secret-test-secret-test-secret");
  const clock = createManualClock();
  const live = new LiveEvents({ db, media, clock });
  const mailer = createMemoryMailer();
  const emits = recordingEmitter();
  live.attach(emits);
  const routes: { method: string; url: string }[] = [];
  const appPromise = buildApp({
    db,
    storage,
    media,
    live,
    mailer,
    publicBaseUrl: PUBLIC_BASE_URL,
    cookieSecure: false,
    retentionMs: RETENTION_MS,
    legal: TEST_LEGAL,
    signupOpen: options.signupOpen ?? true,
    onRoute: (route) => routes.push(route),
  });

  beforeEach(async () => {
    await live.idle();
    live.reset();
    emits.clear();
    mailer.sent.length = 0;
    mailer.failNext = false;
    const tables = await db.execute<{ tablename: string }>(
      rawSql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const names = tables.map((t) => `"${t.tablename}"`).join(", ");
    if (names) await db.execute(rawSql.raw(`truncate ${names} restart identity cascade`));
  });

  afterAll(async () => {
    live.stop();
    await live.idle();
    await (await appPromise).close();
    await sql.end();
  });

  const ctx = {
    db,
    storage,
    media,
    clock,
    live,
    emits,
    /** Verschickte Mails; `failNext` lässt den nächsten Versand scheitern. */
    mailer,
    app: () => appPromise,

    /** Spult die Testuhr vor; Timer laufen und deren DB-Arbeit wird jeweils abgewartet. */
    advance: (ms: number) => clock.advance(ms, () => live.idle()),

    /** Alle registrierten Routen (Methode und Muster wie `/api/admin/events/:id`). */
    routes,

    /** Konto mit diesem Namen; wird beim ersten Aufruf angelegt. Ohne Angabe: das Standardkonto. */
    async account(name = "Test-Konto") {
      const existing = await db.query.account.findFirst({ where: eq(account.name, name) });
      if (existing) return existing.id;
      const [created] = await db.insert(account).values({ name }).returning({ id: account.id });
      return created!.id;
    },

    /** Legt ein Event mit den Standardfragen an (Status standardmäßig „offen“, im Standardkonto). */
    async createEvent(status: EventStatus = "open", slug = "testev", accountName?: string) {
      const id = await createEvent(
        db,
        { title: "Test-Event", startsAt: null, slug },
        { accountId: await ctx.account(accountName), createdBy: null },
        DEFAULT_QUESTIONS,
      );
      await db.update(event).set({ status }).where(eq(event.id, id));
      return { id, slug };
    },

    async createAdmin(
      email = "admin@test.local",
      password = "richtig-langes-passwort",
      accountName?: string,
    ) {
      const accountId = await ctx.account(accountName);
      // Wie im Betrieb: Die erste Person eines Kontos ist Inhaber*in, alle weiteren Mitglieder.
      const first = (await db.$count(adminUser, eq(adminUser.accountId, accountId))) === 0;
      const [admin] = await db
        .insert(adminUser)
        .values({
          accountId,
          email,
          passwordHash: await hashPassword(password),
          role: first ? "owner" : "member",
          emailVerifiedAt: new Date(),
        })
        .returning();
      return { ...admin!, password };
    },

    /**
     * Legt einen Admin an, meldet ihn an und gibt das Session-Cookie zurück. Jeder Login kommt von
     * einer eigenen Adresse, damit das Login-Limit (10 je IP) nicht über viele Tests hinweg greift.
     */
    async loginAs(email = "admin@test.local", accountName?: string) {
      const admin = await ctx.createAdmin(email, undefined, accountName);
      loginCount += 1;
      const res = await (
        await appPromise
      ).inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: admin.password },
        remoteAddress: `10.99.${loginCount >> 8}.${loginCount & 255}`,
      });
      const cookie = res.cookies.find((c) => c.name === "comatch_admin");
      if (!cookie) throw new Error(`Login fehlgeschlagen: ${res.statusCode} ${res.body}`);
      return { admin, cookie: `${cookie.name}=${cookie.value}` };
    },
  };
  return ctx;
}

/** Merkt sich alle Live-Nachrichten, damit Tests prüfen können, wer was bekommen hat. */
function recordingEmitter() {
  const participantStates = new Map<string, ParticipantLive[]>();
  const eventStates = new Map<string, EventLive[]>();
  const invalidated: { id: string; reason: string }[] = [];
  const emitter: Emitter = {
    toParticipant: (id, state) => participantStates.set(id, [...(participantStates.get(id) ?? []), state]),
    toEvent: (id, state) => eventStates.set(id, [...(eventStates.get(id) ?? []), state]),
    invalidate: (id, reason) => invalidated.push({ id, reason }),
  };
  return {
    ...emitter,
    invalidated,
    /** Letzter Zustand, den ein Handy bekommen hat. */
    lastFor: (participantId: string) => participantStates.get(participantId)?.at(-1),
    /** Wie viele Zustände ein Handy bisher bekommen hat. */
    countFor: (participantId: string) => participantStates.get(participantId)?.length ?? 0,
    lastEvent: (eventId: string) => eventStates.get(eventId)?.at(-1),
    clear() {
      participantStates.clear();
      eventStates.clear();
      invalidated.length = 0;
    },
  };
}
