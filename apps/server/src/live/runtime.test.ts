import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { matchGroup } from "../db/schema.ts";
import { useTestApp } from "../../test/helpers.ts";
import { liveHelpers } from "../../test/live.ts";
import { LiveEvents, POOL_TICK_MS } from "./runtime.ts";

const t = useTestApp();
const { addReady, eventRow, statusOf } = liveHelpers(t);
const ROUND_MS = 300_000;

/** Zuordnung Person → Partner-IDs laut letztem gesendeten Zustand. */
function partnersOf(ids: readonly string[]) {
  return Object.fromEntries(
    ids.map((id) => [id, (t.emits.lastFor(id)?.match?.partners ?? []).map((p) => p.id).sort()]),
  );
}

describe("Event-Steuerung", () => {
  it("startet die erste Runde und paart alle Anwesenden", async () => {
    const { id } = await t.createEvent("open");
    const people = await addReady(id, 4);

    await t.live.control(id, "start");

    const ev = await eventRow(id);
    expect(ev).toMatchObject({ status: "running", currentRound: 1 });
    expect(ev.roundEndsAt!.getTime()).toBe(t.clock.now() + ROUND_MS);

    for (const p of people) {
      const state = t.emits.lastFor(p.id)!;
      expect(state.status).toBe("matched");
      expect(state.clock).toMatchObject({
        status: "running",
        round: 1,
        roundEndsAt: t.clock.now() + ROUND_MS,
      });
      expect(state.match!.partners).toHaveLength(1);
      expect(state.match!.partners[0]!.selfieUrl).toMatch(/^\/api\/media\/events\//);
      expect(state.match!.ownCode).toMatch(/^\d{3}$/);
    }
    // Paare sind gegenseitig.
    const partners = partnersOf(people.map((p) => p.id));
    for (const p of people) expect(partners[partners[p.id]![0]!]).toEqual([p.id]);

    expect(t.emits.lastEvent(id)).toMatchObject({
      clock: { status: "running", round: 1 },
      counts: { joined: 4, active: 4, matched: 4, waiting: 0 },
      matches: { open: 2, confirmed: 0 },
    });
  });

  it("wechselt die Runde automatisch und paart neu ohne Wiederholung", async () => {
    const { id } = await t.createEvent("open");
    const people = await addReady(id, 4);
    await t.live.control(id, "start");
    const before = partnersOf(people.map((p) => p.id));

    await t.advance(ROUND_MS);

    expect(await eventRow(id)).toMatchObject({ currentRound: 2 });
    const after = partnersOf(people.map((p) => p.id));
    for (const p of people) {
      expect(after[p.id]).toHaveLength(1);
      expect(after[p.id]).not.toEqual(before[p.id]);
    }
    const groups = await t.db.select().from(matchGroup).where(eq(matchGroup.eventId, id));
    expect(groups.filter((g) => g.status === "expired")).toHaveLength(2);
    expect(groups.filter((g) => g.status === "open")).toHaveLength(2);
  });

  it("hält bei Pause die Restzeit an und setzt sie beim Fortsetzen fort", async () => {
    const { id } = await t.createEvent("open");
    await addReady(id, 2);
    await t.live.control(id, "start");
    await t.advance(100_000);

    await t.live.control(id, "pause");
    expect(await eventRow(id)).toMatchObject({
      status: "paused",
      roundEndsAt: null,
      pausedRemainingMs: 200_000,
    });
    await t.advance(60 * 60_000);
    expect(await eventRow(id)).toMatchObject({ status: "paused", currentRound: 1 });

    await t.live.control(id, "resume");
    expect((await eventRow(id)).roundEndsAt!.getTime()).toBe(t.clock.now() + 200_000);
    await t.advance(199_000);
    expect((await eventRow(id)).currentRound).toBe(1);
    await t.advance(1_000);
    expect((await eventRow(id)).currentRound).toBe(2);
  });

  it("startet auf Wunsch sofort die nächste Runde", async () => {
    const { id } = await t.createEvent("open");
    await addReady(id, 2);
    await t.live.control(id, "start");
    await t.live.control(id, "next_round");
    const ev = await eventRow(id);
    expect(ev.currentRound).toBe(2);
    expect(ev.roundEndsAt!.getTime()).toBe(t.clock.now() + ROUND_MS);
  });

  it("beendet das Event: offene Matches verfallen, keine weiteren Runden", async () => {
    const { id } = await t.createEvent("open");
    const [a] = await addReady(id, 2);
    await t.live.control(id, "start");
    await t.live.control(id, "end");

    expect(await eventRow(id)).toMatchObject({ status: "ended", roundEndsAt: null });
    expect((await eventRow(id)).endedAt).not.toBeNull();
    const groups = await t.db.select().from(matchGroup).where(eq(matchGroup.eventId, id));
    expect(groups.every((g) => g.status === "expired")).toBe(true);
    expect(t.emits.lastFor(a!.id)).toMatchObject({ clock: { status: "ended" }, match: null });

    await t.advance(2 * ROUND_MS);
    expect((await eventRow(id)).currentRound).toBe(1);
  });

  it("lehnt unpassende Statuswechsel ab", async () => {
    const { id } = await t.createEvent("draft");
    await expect(t.live.control(id, "start")).rejects.toMatchObject({
      status: 409,
      code: "invalid_transition",
    });
    await expect(t.live.control(id, "pause")).rejects.toMatchObject({ status: 409 });
  });

  it("lässt eine einzelne Person warten, statt sie allein zu matchen", async () => {
    const { id } = await t.createEvent("open");
    const [solo] = await addReady(id, 1);
    await t.live.control(id, "start");
    expect(t.emits.lastFor(solo!.id)).toMatchObject({ status: "pool", match: null, activeParticipants: 1 });
  });
});

describe("Pool für Nachzügler", () => {
  it("paart zwei Nachzügler beim nächsten Pool-Durchlauf", async () => {
    const { id } = await t.createEvent("open");
    await addReady(id, 2);
    await t.live.control(id, "start");

    const late = await addReady(id, 2);
    expect(await statusOf(late[0]!.id)).toBe("pool");
    await t.advance(POOL_TICK_MS);

    const state = t.emits.lastFor(late[0]!.id)!;
    expect(state.match).toMatchObject({ kind: "pool", partners: [{ id: late[1]!.id }] });
  });

  it("setzt eine einzelne Person nach der Wartezeit als Dritte in ein offenes Match", async () => {
    const { id } = await t.createEvent("open");
    await addReady(id, 4);
    await t.live.control(id, "start");

    const [late] = await addReady(id, 1);
    await t.advance(POOL_TICK_MS * 9); // 27 s: noch innerhalb der Wartezeit
    expect(await statusOf(late!.id)).toBe("pool");

    await t.advance(POOL_TICK_MS);
    const state = t.emits.lastFor(late!.id)!;
    expect(state.status).toBe("matched");
    expect(state.match!.partners).toHaveLength(2);
    // Die beiden anderen sehen jetzt ebenfalls zwei Gegenüber.
    for (const partner of state.match!.partners) {
      expect(t.emits.lastFor(partner.id)!.match!.partners.map((p) => p.id)).toContain(late!.id);
    }
  });

  it("matcht kurz vor Rundenende niemanden mehr, sondern nimmt alle in die nächste Runde", async () => {
    const { id } = await t.createEvent("open");
    await addReady(id, 2);
    await t.live.control(id, "start");
    await t.advance(ROUND_MS - 50_000);

    const late = await addReady(id, 2);
    await t.advance(POOL_TICK_MS);
    expect(await statusOf(late[0]!.id)).toBe("pool");

    await t.advance(50_000);
    expect((await eventRow(id)).currentRound).toBe(2);
    expect(await statusOf(late[0]!.id)).toBe("matched");
  });
});

describe("Anwesenheit", () => {
  it("lässt Abwesende in der nächsten Runde aus und holt sie bei Rückkehr zurück", async () => {
    const { id } = await t.createEvent("open");
    const people = await addReady(id, 4);
    await t.live.control(id, "start");

    await t.live.disconnect(people[0]!.id, id);
    await t.advance(ROUND_MS);

    expect(await statusOf(people[0]!.id)).toBe("inactive");
    // Die anderen drei bilden eine Dreiergruppe.
    expect(t.emits.lastFor(people[1]!.id)!.match!.partners).toHaveLength(2);
    expect(t.emits.lastEvent(id)!.counts).toMatchObject({ active: 3, inactive: 1 });

    await t.live.connect(people[0]!.id, id);
    await t.live.idle();
    expect(await statusOf(people[0]!.id)).toBe("pool");
  });

  it("zählt kurz Abwesende (z. B. gesperrtes Handy) weiter als aktiv", async () => {
    const { id } = await t.createEvent("open");
    const people = await addReady(id, 2);
    await t.live.control(id, "start");
    await t.live.disconnect(people[0]!.id, id);
    await t.advance(30_000);
    await t.live.control(id, "next_round");
    expect(await statusOf(people[0]!.id)).toBe("matched");
  });
});

describe("Austritt", () => {
  it("schickt das Gegenüber ohne Wartezeit zurück in den Pool", async () => {
    const { id } = await t.createEvent("open");
    const people = await addReady(id, 4);
    await t.live.control(id, "start");
    const leaver = people[0]!;
    const partnerId = t.emits.lastFor(leaver.id)!.match!.partners[0]!.id;

    const res = await (
      await t.app()
    ).inject({
      method: "DELETE",
      url: "/api/participant",
      headers: { authorization: `Bearer ${leaver.token}` },
    });
    expect(res.statusCode).toBe(204);
    expect(t.emits.invalidated).toContainEqual({ id: leaver.id, reason: "unknown" });
    expect(await statusOf(partnerId)).toBe("pool");
    expect(t.emits.lastFor(partnerId)).toMatchObject({ status: "pool", match: null });

    // Beim nächsten Pool-Durchlauf kommt die Person in das andere Match.
    await t.advance(POOL_TICK_MS);
    expect(t.emits.lastFor(partnerId)!.match!.partners).toHaveLength(2);
  });
});

describe("Neustart", () => {
  it("setzt laufende Runden nach einem Neustart fort", async () => {
    const { id } = await t.createEvent("open");
    const people = await addReady(id, 2);
    await t.live.control(id, "start");
    t.live.stop();

    const restarted = new LiveEvents({ db: t.db, media: t.media, clock: t.clock });
    for (const p of people) await restarted.connect(p.id, id);
    await restarted.restore();
    await t.clock.advance(ROUND_MS, () => restarted.idle());

    expect((await eventRow(id)).currentRound).toBe(2);
    restarted.stop();
    await restarted.idle();
  });
});

describe("POST /api/admin/events/:id/control", () => {
  it("steuert das Event und prüft Anmeldung und Eingaben", async () => {
    const { id } = await t.createEvent("open");
    const app = await t.app();
    const anonymous = await app.inject({
      method: "POST",
      url: `/api/admin/events/${id}/control`,
      payload: { action: "start" },
    });
    expect(anonymous.statusCode).toBe(401);

    const { cookie } = await t.loginAs();
    const control = (action: string) =>
      app.inject({
        method: "POST",
        url: `/api/admin/events/${id}/control`,
        headers: { cookie },
        payload: { action },
      });
    expect((await control("start")).json()).toMatchObject({ status: "running" });
    expect((await control("start")).statusCode).toBe(409);
    expect((await control("explode")).statusCode).toBe(400);
  });
});
