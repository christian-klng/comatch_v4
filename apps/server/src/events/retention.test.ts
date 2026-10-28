import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { EventDetail, EventStats } from "@comatch/shared";
import { event, participant, participantAnswer } from "../db/schema.ts";
import { RETENTION_MS, TEST_LEGAL, useTestApp } from "../../test/helpers.ts";
import { liveHelpers } from "../../test/live.ts";
import { ABANDONED_AFTER_MS, endAbandoned, purgeExpired } from "./retention.ts";

const t = useTestApp();
const { addReady, eventRow } = liveHelpers(t);
const HOUR = 60 * 60 * 1000;

/** Event mit Personen und Selfies im Speicher, beendet vor `endedAgo` ms. */
async function endedEvent(endedAgo: number, slug = "testev") {
  const { id } = await t.createEvent("open", slug);
  const people = await addReady(id, 2);
  for (const p of people) {
    await t.storage.put(`events/${id}/selfies/${p.id}/a.jpg`, Buffer.from("x"), "image/jpeg");
    await t.db
      .update(participant)
      .set({ selfieKey: `events/${id}/selfies/${p.id}/a.jpg` })
      .where(eq(participant.id, p.id));
  }
  await t.live.control(id, "start");
  await t.live.control(id, "end");
  await t.db
    .update(event)
    .set({ endedAt: new Date(Date.now() - endedAgo) })
    .where(eq(event.id, id));
  return { id, people };
}

describe("Automatische Löschung", () => {
  it("löscht Selfies und Sitzungen nach Ablauf der Frist, Statistik bleibt", async () => {
    const { id, people } = await endedEvent(RETENTION_MS + HOUR);
    const recent = await endedEvent(RETENTION_MS - HOUR, "recent");

    expect(await purgeExpired(t.db, t.storage, new Date(), RETENTION_MS)).toEqual([id]);

    expect(t.storage.keys().filter((k) => k.startsWith(`events/${id}/`))).toEqual([]);
    expect(t.storage.keys().filter((k) => k.startsWith(`events/${recent.id}/`))).toHaveLength(2);
    const rows = await t.db.select().from(participant).where(eq(participant.eventId, id));
    expect(rows.every((r) => r.selfieKey === null && r.sessionTokenHash.startsWith("purged:"))).toBe(true);
    expect((await eventRow(id)).purgedAt).not.toBeNull();

    // Alte Sitzungen gelten nicht mehr.
    const app = await t.app();
    const me = await app.inject({
      url: "/api/participant",
      headers: { authorization: `Bearer ${people[0]!.token}` },
    });
    expect(me.statusCode).toBe(401);

    // Antworten bleiben für die Statistik (ohne Foto und Sitzung keiner Person zuzuordnen).
    expect(await t.db.$count(participantAnswer)).toBeGreaterThanOrEqual(6);

    // Zweiter Lauf: nichts mehr zu tun.
    expect(await purgeExpired(t.db, t.storage, new Date(), RETENTION_MS)).toEqual([]);
  });

  it("beendet vergessene Events nach einer Woche ohne Aktivität", async () => {
    const old = new Date(Date.now() - ABANDONED_AFTER_MS - HOUR);
    const { id: forgotten } = await t.createEvent("open", "vergessen");
    const [person] = await addReady(forgotten, 1, { connect: false });
    await t.db.update(event).set({ createdAt: old }).where(eq(event.id, forgotten));
    await t.db.update(participant).set({ lastSeenAt: old }).where(eq(participant.id, person!.id));

    const { id: active } = await t.createEvent("open", "aktiv");
    await addReady(active, 1, { connect: false });
    await t.db.update(event).set({ createdAt: old }).where(eq(event.id, active));

    const { id: fresh } = await t.createEvent("open", "neu");

    expect(await endAbandoned(t.db, t.live, new Date())).toEqual([forgotten]);
    expect((await eventRow(forgotten)).status).toBe("ended");
    expect((await eventRow(active)).status).toBe("open");
    expect((await eventRow(fresh)).status).toBe("open");
  });
});

describe("Admin: Fotos sofort löschen", () => {
  it("geht nur bei beendeten Events und zeigt Frist und Zeitpunkt", async () => {
    const { cookie } = await t.loginAs();
    const app = await t.app();
    const { id } = await endedEvent(HOUR);

    const before = await app.inject({ url: `/api/admin/events/${id}`, headers: { cookie } });
    const detail = before.json<EventDetail>();
    expect(detail.purgedAt).toBeNull();
    expect(new Date(detail.purgeAt!).getTime()).toBe(new Date(detail.endedAt!).getTime() + RETENTION_MS);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/events/${id}/purge`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<EventDetail>()).toMatchObject({ purgeAt: null, purgedAt: expect.any(String) });
    expect(t.storage.keys().filter((k) => k.startsWith(`events/${id}/`))).toEqual([]);

    const stats = await app.inject({ url: `/api/admin/events/${id}/stats`, headers: { cookie } });
    expect(stats.json<EventStats>().participants).toBe(2);

    const { id: running } = await t.createEvent("running", "laeuft");
    const refused = await app.inject({
      method: "POST",
      url: `/api/admin/events/${running}/purge`,
      headers: { cookie },
    });
    expect(refused.statusCode).toBe(409);
  });
});

describe("GET /api/legal", () => {
  it("liefert die Angaben für Impressum und Datenschutz", async () => {
    const res = await (await t.app()).inject({ url: "/api/legal" });
    expect(res.json()).toEqual(TEST_LEGAL);
  });
});
