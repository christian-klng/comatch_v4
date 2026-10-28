import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { event, participant } from "../db/schema.ts";
import type { LiveEvents } from "../live/runtime.ts";
import type { Storage } from "../storage/storage.ts";

/** Events ohne Aktivität so lange offen: gelten als vergessen und werden beendet. */
export const ABANDONED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Wie oft die Löschfristen geprüft werden. */
export const RETENTION_CHECK_MS = 10 * 60 * 1000;

const selfiesPrefix = (eventId: string) => `events/${eventId}/selfies/`;

/**
 * Löscht Selfies und Sitzungen eines Events. Antworten und Matches bleiben für die Statistik;
 * ohne Foto und ohne Sitzung lassen sie sich keiner Person mehr zuordnen.
 */
export async function purgeEvent(db: Db, storage: Storage, eventId: string, now: Date) {
  await storage.deletePrefix(selfiesPrefix(eventId));
  await db.transaction(async (tx) => {
    await tx
      .update(participant)
      .set({
        selfieKey: null,
        // Eindeutig, aber kein Hash eines echten Tokens: alte Sitzungen sind damit ungültig.
        sessionTokenHash: sql`'purged:' || ${participant.id}`,
      })
      .where(eq(participant.eventId, eventId));
    await tx.update(event).set({ purgedAt: now }).where(eq(event.id, eventId));
  });
}

/** Beendete Events, deren Frist abgelaufen ist, löschen. Gibt die IDs der gelöschten Events zurück. */
export async function purgeExpired(db: Db, storage: Storage, now: Date, retentionMs: number) {
  const due = await db
    .select({ id: event.id })
    .from(event)
    .where(
      and(
        eq(event.status, "ended"),
        isNull(event.purgedAt),
        lte(event.endedAt, new Date(now.getTime() - retentionMs)),
      ),
    );
  for (const { id } of due) await purgeEvent(db, storage, id, now);
  return due.map((e) => e.id);
}

/**
 * Vergessene Events beenden: offen, laufend oder pausiert, aber seit einer Woche ohne jede
 * Aktivität. Danach greift die normale Löschfrist, damit keine Selfies liegen bleiben.
 */
export async function endAbandoned(db: Db, live: LiveEvents, now: Date) {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS);
  const candidates = await db
    .select({ id: event.id })
    .from(event)
    .where(and(inArray(event.status, ["open", "running", "paused"]), lte(event.createdAt, cutoff)));
  const ended: string[] = [];
  for (const { id } of candidates) {
    const active = await db.$count(
      participant,
      and(eq(participant.eventId, id), gt(participant.lastSeenAt, cutoff)),
    );
    if (active > 0) continue;
    await live.control(id, "end");
    ended.push(id);
  }
  return ended;
}

export interface RetentionDeps {
  db: Db;
  storage: Storage;
  live: LiveEvents;
  retentionMs: number;
  now?: () => Date;
}

/** Ein Durchlauf: vergessene Events beenden, abgelaufene löschen. */
export async function runRetention(deps: RetentionDeps) {
  const now = deps.now?.() ?? new Date();
  const ended = await endAbandoned(deps.db, deps.live, now);
  const purged = await purgeExpired(deps.db, deps.storage, now, deps.retentionMs);
  return { ended, purged };
}
