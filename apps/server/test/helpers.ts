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
import { adminUser, event } from "../src/db/schema.ts";
import { createEvent } from "../src/events/service.ts";
import { createMediaSigner } from "../src/lib/media.ts";
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
export function useTestApp() {
  const { db, sql } = createDb(TEST_DATABASE_URL);
  const storage = createMemoryStorage();
  const media = createMediaSigner("test-secret-test-secret-test-secret");
  const clock = createManualClock();
  const live = new LiveEvents({ db, media, clock });
  const emits = recordingEmitter();
  live.attach(emits);
  const appPromise = buildApp({
    db,
    storage,
    media,
    live,
    publicBaseUrl: PUBLIC_BASE_URL,
    cookieSecure: false,
    retentionMs: RETENTION_MS,
    legal: TEST_LEGAL,
  });

  beforeEach(async () => {
    await live.idle();
    live.reset();
    emits.clear();
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
    app: () => appPromise,

    /** Spult die Testuhr vor; Timer laufen und deren DB-Arbeit wird jeweils abgewartet. */
    advance: (ms: number) => clock.advance(ms, () => live.idle()),

    /** Legt ein Event mit den Standardfragen an (Status standardmäßig „offen“). */
    async createEvent(status: EventStatus = "open", slug = "testev") {
      const id = await createEvent(
        db,
        { title: "Test-Event", startsAt: null, slug },
        null,
        DEFAULT_QUESTIONS,
      );
      await db.update(event).set({ status }).where(eq(event.id, id));
      return { id, slug };
    },

    async createAdmin(email = "admin@test.local", password = "richtig-langes-passwort") {
      const [admin] = await db
        .insert(adminUser)
        .values({ email, passwordHash: await hashPassword(password) })
        .returning();
      return { ...admin!, password };
    },

    /** Legt einen Admin an, meldet ihn an und gibt das Session-Cookie zurück. */
    async loginAs(email = "admin@test.local") {
      const admin = await ctx.createAdmin(email);
      const res = await (
        await appPromise
      ).inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: admin.password },
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
