import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { event } from "../db/schema.ts";
import { useTestApp } from "../../test/helpers.ts";
import { liveHelpers } from "../../test/live.ts";

const t = useTestApp();
const { addReady } = liveHelpers(t);
const ROUND_MS = 300_000;

const eventState = (eventId: string) => t.emits.lastEvent(eventId)!;
const matchOf = (participantId: string) => t.emits.lastFor(participantId)!.match!;

/** Bestätigt das Match dieser Person auf beiden Seiten. */
async function confirmPair(eventId: string, participantId: string) {
  for (const id of [participantId, matchOf(participantId).confirm.targetId]) {
    const match = matchOf(id);
    const code = matchOf(match.confirm.targetId).ownCode;
    await t.live.confirmCode(eventId, { participantId: id, matchId: match.id, code });
  }
}

describe("Zustand für die Leinwand", () => {
  it("zeigt in der Lobby die zuletzt Beigetretenen", async () => {
    const { id } = await t.createEvent("open");
    await addReady(id, 3);
    await t.live.participantChanged(id);
    const state = eventState(id);
    expect(state.selfies).toHaveLength(3);
    expect(state.selfies[0]).toMatch(/^\/api\/media\/events\/.+\?exp=\d+&sig=/);
    expect(state.totals).toEqual({ confirmedMatches: 0, rounds: 0 });
    expect(state.recentConfirmed).toEqual([]);
  });

  it("meldet bestätigte Matches mit Selfies und zählt über Runden", async () => {
    const { id } = await t.createEvent("open");
    const people = await addReady(id, 4);
    await t.live.control(id, "start");
    expect(eventState(id).selfies).toEqual([]);

    await confirmPair(id, people[0]!.id);
    const first = eventState(id);
    expect(first.recentConfirmed).toHaveLength(1);
    expect(first.recentConfirmed[0]!.selfies).toHaveLength(2);
    expect(first.recentConfirmed[0]!.selfies.every((s) => s?.startsWith("/api/media/"))).toBe(true);
    expect(first.totals).toEqual({ confirmedMatches: 1, rounds: 1 });

    const other = people.find(
      (p) => p.id !== people[0]!.id && p.id !== matchOf(people[0]!.id).confirm.targetId,
    )!;
    await confirmPair(id, other.id);
    const second = eventState(id);
    expect(second.recentConfirmed.map((m) => m.id)).toEqual([
      first.recentConfirmed[0]!.id,
      matchOf(other.id).id,
    ]);

    // Neue Runde: Liste beginnt von vorn, die Summe bleibt.
    await t.advance(ROUND_MS);
    expect(eventState(id).recentConfirmed).toEqual([]);
    expect(eventState(id).totals).toEqual({ confirmedMatches: 2, rounds: 2 });
  });

  it("liefert nach dem Ende alle Selfies für die Collage", async () => {
    const { id } = await t.createEvent("open");
    await addReady(id, 5);
    await t.live.control(id, "start");
    await t.live.control(id, "end");
    expect(eventState(id).selfies).toHaveLength(5);
  });
});

describe("GET /api/present/:eventId", () => {
  it("liefert Titel und Beitrittslink nur mit gültigem Token", async () => {
    const app = await t.app();
    const { id, slug } = await t.createEvent("open");
    const [row] = await t.db.select({ token: event.presenterToken }).from(event).where(eq(event.id, id));

    const ok = await app.inject({ url: `/api/present/${id}?token=${row!.token}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({
      id,
      title: "Test-Event",
      language: "de",
      joinUrl: `http://comatch.test/e/${slug}`,
      logoUrl: null,
      primaryColor: null,
    });

    expect((await app.inject({ url: `/api/present/${id}?token=falsch` })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/present/${id}` })).statusCode).toBe(400);
  });
});
