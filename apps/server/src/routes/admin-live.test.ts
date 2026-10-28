import { describe, expect, it } from "vitest";
import { EXTEND_ROUND_MS, type AdminParticipant, type EventStats } from "@comatch/shared";
import { useTestApp } from "../../test/helpers.ts";
import { liveHelpers } from "../../test/live.ts";

const t = useTestApp();
const { addReady, eventRow, statusOf } = liveHelpers(t);
const ROUND_MS = 300_000;

const matchOf = (participantId: string) => t.emits.lastFor(participantId)!.match!;

async function confirmPair(eventId: string, participantId: string) {
  for (const id of [participantId, matchOf(participantId).confirm.targetId]) {
    const match = matchOf(id);
    await t.live.confirmCode(eventId, {
      participantId: id,
      matchId: match.id,
      code: matchOf(match.confirm.targetId).ownCode,
    });
  }
}

/** Event mit angemeldeten Personen, gestartet, plus Admin-Cookie für die Endpunkte. */
async function setup(count: number) {
  const { id, slug } = await t.createEvent("open");
  const people = await addReady(id, count);
  await t.live.control(id, "start");
  const { cookie } = await t.loginAs();
  const app = await t.app();
  const call = (method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url: `/api/admin/events/${id}${url}`, headers: { cookie }, payload });
  return { id, slug, people, call };
}

describe("Runde verlängern", () => {
  it("gibt der laufenden Runde eine Minute dazu und verschiebt den Rundenwechsel", async () => {
    const { id, call } = await setup(2);
    const before = (await eventRow(id)).roundEndsAt!.getTime();
    expect((await call("POST", "/control", { action: "extend" })).statusCode).toBe(200);
    expect((await eventRow(id)).roundEndsAt!.getTime()).toBe(before + EXTEND_ROUND_MS);

    await t.advance(ROUND_MS);
    expect((await eventRow(id)).currentRound).toBe(1);
    await t.advance(EXTEND_ROUND_MS);
    expect((await eventRow(id)).currentRound).toBe(2);
  });

  it("verlängert auch während der Pause", async () => {
    const { id, call } = await setup(2);
    await t.live.control(id, "pause");
    const before = (await eventRow(id)).pausedRemainingMs!;
    await call("POST", "/control", { action: "extend" });
    expect((await eventRow(id)).pausedRemainingMs).toBe(before + EXTEND_ROUND_MS);
  });

  it("geht vor dem Start nicht", async () => {
    const { id } = await t.createEvent("open");
    await expect(t.live.control(id, "extend")).rejects.toMatchObject({ status: 409 });
  });
});

describe("Teilnehmende verwalten", () => {
  it("listet Personen mit Nummer, Antworten, Status und bestätigten Matches", async () => {
    const { id, people, call } = await setup(4);
    await confirmPair(id, people[0]!.id);

    const res = await call("GET", "/participants");
    expect(res.statusCode).toBe(200);
    const list = res.json<AdminParticipant[]>();
    expect(list.map((p) => p.number)).toEqual(["T001", "T002", "T003", "T004"]);
    const first = list.find((p) => p.id === people[0]!.id)!;
    expect(first).toMatchObject({ status: "confirmed", online: true, confirmedMatches: 1 });
    expect(first.answers).toHaveLength(3);
    expect(first.answers.every((a) => a.length > 0)).toBe(true);
    expect(first.selfieUrl).toMatch(/^\/api\/media\//);
  });

  it("setzt ein Selfie zurück: Person fotografiert neu, das Gegenüber sucht weiter", async () => {
    const { id, people, call } = await setup(2);
    const [a, b] = people;
    await t.storage.put(`events/${id}/selfies/${a!.id}/x.jpg`, Buffer.from("x"), "image/jpeg");

    const res = await call("POST", `/participants/${a!.id}/reset-selfie`);
    expect(res.statusCode).toBe(200);
    expect(await statusOf(a!.id)).toBe("onboarding");
    expect(t.emits.lastFor(a!.id)).toMatchObject({ status: "onboarding", match: null });
    expect(t.emits.lastFor(b!.id)).toMatchObject({ status: "pool", match: null });
    expect(await t.storage.get(`events/${id}/selfies/${a!.id}/x.jpg`)).toBeNull();
    expect(res.json<AdminParticipant[]>().find((p) => p.id === a!.id)).toMatchObject({
      status: "onboarding",
      selfieUrl: null,
    });
  });

  it("entfernt eine Person: Sitzung endet, Selfie weg, Matches bleiben in der Statistik", async () => {
    const { id, people, call } = await setup(4);
    const [a] = people;
    await confirmPair(id, a!.id);

    const res = await call("DELETE", `/participants/${a!.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminParticipant[]>().map((p) => p.id)).not.toContain(a!.id);
    expect(await statusOf(a!.id)).toBe("removed");
    expect(t.emits.invalidated).toContainEqual({ id: a!.id, reason: "removed" });

    const app = await t.app();
    const me = await app.inject({
      url: "/api/participant",
      headers: { authorization: `Bearer ${a!.token}` },
    });
    expect(me.statusCode).toBe(401);
    expect(me.json()).toMatchObject({ error: "participant_removed" });

    expect((await call("DELETE", `/participants/${a!.id}`)).statusCode).toBe(404);
    expect((await call("GET", "/stats")).json<EventStats>().matches.confirmed).toBe(1);
  });

  it("schickt das Gegenüber einer entfernten Person zurück in den Pool", async () => {
    const { people, call } = await setup(2);
    const [a, b] = people;
    await call("DELETE", `/participants/${a!.id}`);
    expect(await statusOf(b!.id)).toBe("pool");
  });
});

describe("Statistik und Export", () => {
  it("zählt Matches, Bestätigungsquote und Matches pro Person", async () => {
    const { id, people, call } = await setup(4);
    await confirmPair(id, people[0]!.id);
    await t.advance(ROUND_MS); // Runde 2: alle neu gepaart, die zweite Paarung aus Runde 1 verfällt

    const stats = (await call("GET", "/stats")).json<EventStats>();
    expect(stats).toMatchObject({
      participants: 4,
      rounds: 2,
      matches: { total: 4, confirmed: 1, expired: 1, open: 2, confirmationRate: 0.5 },
      perPerson: { average: 0.5, median: 0.5, max: 1, withoutMatch: 2 },
      byKind: { round: { matches: 4, confirmed: 1 }, pool: { matches: 0, confirmed: 0 } },
    });
    expect(stats.perPerson.histogram).toEqual([
      { matches: 0, people: 2 },
      { matches: 1, people: 2 },
    ]);
    expect(stats.byRound).toEqual([
      { round: 1, matches: 2, confirmed: 1, confirmationRate: 0.5 },
      { round: 2, matches: 2, confirmed: 0, confirmationRate: null },
    ]);
  });

  it("exportiert Matches und Teilnehmende als CSV für Excel", async () => {
    const { id, slug, people, call } = await setup(2);
    await confirmPair(id, people[0]!.id);

    const matches = await call("GET", "/export/matches.csv");
    expect(matches.statusCode).toBe(200);
    expect(matches.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(matches.headers["content-disposition"]).toBe(`attachment; filename="comatch-${slug}-matches.csv"`);
    const rows = matches.body
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    expect(rows[0]).toBe("Runde;Art;Status;Übereinstimmung (%);Erstellt;Bestätigt;Personen");
    expect(rows[1]).toMatch(/^1;Runde;bestätigt;\d+;\d{4}-\d\d-\d\d \d\d:\d\d:\d\d;\d{4}-.+;T001, T002$/);

    const participants = await call("GET", "/export/participants.csv");
    const lines = participants.body
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]!.split(";").slice(0, 3)).toEqual(["Nr", "Beigetreten", "Status"]);
    expect(lines[1]).toMatch(/^T001;.+;bestätigt;.+;1;1$/);

    expect((await call("GET", "/export/selfies.zip")).statusCode).toBe(400);
    const app = await t.app();
    expect((await app.inject({ url: `/api/admin/events/${id}/export/matches.csv` })).statusCode).toBe(401);
  });
});
