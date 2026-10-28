import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MAX_CODE_CHOICES_ATTEMPTS, WRONG_CODE_LOCK_MS } from "@comatch/shared";
import { matchGroup } from "../db/schema.ts";
import { useTestApp } from "../../test/helpers.ts";
import { liveHelpers } from "../../test/live.ts";

const t = useTestApp();
const { addReady, statusOf } = liveHelpers(t);
const ROUND_MS = 300_000;

/** Startet ein Event mit `count` Personen und liefert sie samt Match-Zustand. */
async function started(count: number) {
  const { id } = await t.createEvent("open");
  const people = await addReady(id, count);
  await t.live.control(id, "start");
  return { eventId: id, people };
}

const matchOf = (participantId: string) => t.emits.lastFor(participantId)!.match!;

/** Der Code, den diese Person auswählen muss. */
const targetCode = (participantId: string) => matchOf(matchOf(participantId).confirm.targetId).ownCode;

function confirm(eventId: string, participantId: string, code = targetCode(participantId)) {
  return t.live.confirmCode(eventId, { participantId, matchId: matchOf(participantId).id, code });
}

const wrongCode = (participantId: string) =>
  matchOf(participantId).confirm.options!.find((c) => c !== targetCode(participantId))!;

describe("Bestätigung per Code", () => {
  it("zeigt drei Optionen mit dem Code des Gegenübers und Gemeinsamkeiten", async () => {
    const { people } = await started(2);
    const [a, b] = people;
    const match = matchOf(a!.id);
    expect(match.status).toBe("open");
    expect(match.confirm.targetId).toBe(b!.id);
    expect(match.confirm.options).toHaveLength(3);
    expect(match.confirm.options).toContain(matchOf(b!.id).ownCode);
    expect(match.confirm.options).not.toContain(match.ownCode);
    expect(match.partners[0]!.confirmedMe).toBe(false);
    // Gemeinsamkeiten passen zur Übereinstimmung: je passender Frage ein Eintrag.
    const ground = match.partners[0]!.commonGround;
    for (const item of ground) {
      expect(item.question).not.toBe("");
      if (item.kind === "same") expect(item.own).toBe(item.partner);
    }
    expect(ground.length > 0).toBe(match.similarity > 0);
  });

  it("bestätigt das Match erst, wenn beide den richtigen Code gewählt haben", async () => {
    const { eventId, people } = await started(2);
    const [a, b] = people;

    expect((await confirm(eventId, a!.id)).result).toBe("correct");
    expect(matchOf(a!.id)).toMatchObject({ status: "open", confirm: { confirmed: true } });
    expect(matchOf(b!.id).partners[0]!.confirmedMe).toBe(true);
    expect(await statusOf(a!.id)).toBe("matched");

    const second = await confirm(eventId, b!.id);
    expect(second.result).toBe("confirmed");
    expect(second.state.match!.status).toBe("confirmed");
    expect(await statusOf(a!.id)).toBe("confirmed");
    expect(await statusOf(b!.id)).toBe("confirmed");
    expect(t.emits.lastEvent(eventId)!.matches).toEqual({ open: 0, confirmed: 1 });

    // Doppelt hält besser: nochmal bestätigen ändert nichts.
    expect((await confirm(eventId, b!.id)).result).toBe("confirmed");
  });

  it("sperrt nach einer falschen Auswahl kurz und mischt die Optionen neu", async () => {
    const { eventId, people } = await started(2);
    const [a] = people;
    const before = matchOf(a!.id).confirm.options;

    const res = await confirm(eventId, a!.id, wrongCode(a!.id));
    expect(res.result).toBe("wrong");
    expect(res.state.match!.confirm).toMatchObject({
      wrongAttempts: 1,
      lockedUntil: t.clock.now() + WRONG_CODE_LOCK_MS,
      confirmed: false,
    });
    expect(res.state.match!.confirm.options).not.toEqual(before);
    expect([...res.state.match!.confirm.options!].sort()).toEqual([...before!].sort());

    await expect(confirm(eventId, a!.id)).rejects.toMatchObject({ status: 429, code: "code_locked" });
    await t.advance(WRONG_CODE_LOCK_MS);
    expect((await confirm(eventId, a!.id)).result).toBe("correct");
  });

  it("zeigt nach drei Fehlversuchen keine Auswahl mehr, der Code lässt sich aber eingeben", async () => {
    const { eventId, people } = await started(2);
    const [a] = people;
    for (let i = 0; i < MAX_CODE_CHOICES_ATTEMPTS; i++) {
      await confirm(eventId, a!.id, wrongCode(a!.id) ?? "999");
      await t.advance(WRONG_CODE_LOCK_MS);
    }
    expect(matchOf(a!.id).confirm).toMatchObject({ options: null, wrongAttempts: 3 });
    expect((await confirm(eventId, a!.id)).result).toBe("correct");
  });

  it("schließt in Dreiergruppen erst den ganzen Ring", async () => {
    const { eventId, people } = await started(3);
    const ids = people.map((p) => p.id);
    expect(matchOf(ids[0]!).partners).toHaveLength(2);
    const targets = ids.map((id) => matchOf(id).confirm.targetId);
    expect(new Set(targets).size).toBe(3);

    expect((await confirm(eventId, ids[0]!)).result).toBe("correct");
    expect((await confirm(eventId, ids[1]!)).result).toBe("correct");
    expect(await statusOf(ids[0]!)).toBe("matched");
    expect((await confirm(eventId, ids[2]!)).result).toBe("confirmed");
    for (const id of ids) expect(await statusOf(id)).toBe("confirmed");
  });

  it("lehnt Codes für ein altes Match ab und paart Bestätigte in der nächsten Runde neu", async () => {
    const { eventId, people } = await started(4);
    const [a] = people;
    const partner = matchOf(a!.id).confirm.targetId;
    await confirm(eventId, a!.id);
    await confirm(eventId, partner);
    expect(await statusOf(a!.id)).toBe("confirmed");

    const oldMatch = matchOf(a!.id).id;
    const oldCode = targetCode(a!.id);
    await t.advance(ROUND_MS);
    expect(await statusOf(a!.id)).toBe("matched");
    expect(matchOf(a!.id).id).not.toBe(oldMatch);
    await expect(
      t.live.confirmCode(eventId, { participantId: a!.id, matchId: oldMatch, code: oldCode }),
    ).rejects.toMatchObject({ status: 409, code: "match_changed" });
  });

  it("schickt nur den Beteiligten einen neuen Zustand", async () => {
    const { eventId, people } = await started(4);
    const [a] = people;
    const partner = matchOf(a!.id).confirm.targetId;
    const others = people.map((p) => p.id).filter((id) => id !== a!.id && id !== partner);
    const before = others.map((id) => t.emits.countFor(id));
    const partnerBefore = t.emits.countFor(partner);

    await confirm(eventId, a!.id);
    expect(others.map((id) => t.emits.countFor(id))).toEqual(before);
    expect(t.emits.countFor(partner)).toBe(partnerBefore + 1);
  });

  it("nimmt in der Pause keine Codes an", async () => {
    const { eventId, people } = await started(2);
    await t.live.control(eventId, "pause");
    await expect(confirm(eventId, people[0]!.id)).rejects.toMatchObject({ code: "event_not_running" });
  });
});

describe("Nicht gefunden", () => {
  const giveUp = (eventId: string, participantId: string) =>
    t.live.giveUp(eventId, { participantId, matchId: matchOf(participantId).id });

  it("geht erst ab Rundenmitte", async () => {
    const { eventId, people } = await started(2);
    const [a] = people;
    expect(matchOf(a!.id).notFoundFrom).toBe(t.clock.now() + ROUND_MS / 2);
    await expect(giveUp(eventId, a!.id)).rejects.toMatchObject({ code: "not_found_too_early" });
  });

  it("löst ein Paar auf und schickt beide sofort in den Pool", async () => {
    const { eventId, people } = await started(2);
    const [a, b] = people;
    const matchId = matchOf(a!.id).id;
    await t.advance(ROUND_MS / 2);

    const state = await giveUp(eventId, a!.id);
    expect(state).toMatchObject({ status: "pool", match: null, previousMatchEnded: true });
    expect(t.emits.lastFor(b!.id)).toMatchObject({ status: "pool", match: null, previousMatchEnded: true });
    const [group] = await t.db.select().from(matchGroup).where(eq(matchGroup.id, matchId));
    expect(group!.status).toBe("expired");
  });

  it("setzt nach „Nicht gefunden“ eine der beiden sofort in ein anderes offenes Match", async () => {
    const { eventId, people } = await started(4);
    const [a] = people;
    const oldPartner = matchOf(a!.id).confirm.targetId;
    await t.advance(ROUND_MS / 2);
    await giveUp(eventId, a!.id);

    // Die beiden können nicht wieder zueinander; eine Person kommt als Dritte zum anderen Paar.
    const states = [a!.id, oldPartner].map((id) => t.emits.lastFor(id)!);
    const joined = states.filter((s) => s.match);
    const waiting = states.filter((s) => !s.match);
    expect(joined).toHaveLength(1);
    expect(joined[0]!.match!.partners).toHaveLength(2);
    expect(joined[0]!.match!.partners.map((p) => p.id)).not.toContain(a!.id);
    expect(joined[0]!.match!.partners.map((p) => p.id)).not.toContain(oldPartner);
    expect(waiting[0]).toMatchObject({ status: "pool", previousMatchEnded: true });
  });

  it("lässt in einer Dreiergruppe die anderen beiden weitersuchen", async () => {
    const { eventId, people } = await started(3);
    const [a, b, c] = people;
    await t.advance(ROUND_MS / 2);

    await giveUp(eventId, a!.id);
    expect(await statusOf(a!.id)).toBe("pool");
    expect(matchOf(b!.id).partners.map((p) => p.id)).toEqual([c!.id]);
    expect(matchOf(b!.id).confirm.targetId).toBe(c!.id);
    expect(matchOf(c!.id).confirm.targetId).toBe(b!.id);
    expect((await confirm(eventId, b!.id)).result).toBe("correct");
    expect((await confirm(eventId, c!.id)).result).toBe("confirmed");
  });

  it("ist nach der eigenen Bestätigung nicht mehr möglich", async () => {
    const { eventId, people } = await started(2);
    const [a] = people;
    await confirm(eventId, a!.id);
    expect(matchOf(a!.id).notFoundFrom).toBeNull();
    await t.advance(ROUND_MS / 2);
    await expect(giveUp(eventId, a!.id)).rejects.toMatchObject({ code: "match_changed" });
  });
});

describe("Endpunkte", () => {
  it("POST /api/participant/match/confirm und /not-found prüfen Anmeldung und Eingaben", async () => {
    const app = await t.app();
    const { people } = await started(2);
    const [a] = people;
    const auth = { authorization: `Bearer ${a!.token}` };
    const matchId = matchOf(a!.id).id;

    const anonymous = await app.inject({
      method: "POST",
      url: "/api/participant/match/confirm",
      payload: { matchId, code: "123" },
    });
    expect(anonymous.statusCode).toBe(401);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/participant/match/confirm",
      headers: auth,
      payload: { matchId, code: "12a" },
    });
    expect(invalid.statusCode).toBe(400);

    const ok = await app.inject({
      method: "POST",
      url: "/api/participant/match/confirm",
      headers: auth,
      payload: { matchId, code: targetCode(a!.id) },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      result: "correct",
      state: { match: { confirm: { confirmed: true } } },
    });

    const early = await app.inject({
      method: "POST",
      url: "/api/participant/match/not-found",
      headers: auth,
      payload: { matchId },
    });
    expect(early.statusCode).toBe(409);
  });
});
