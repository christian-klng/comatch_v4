import { describe, expect, it } from "vitest";
import { DEFAULT_QUESTIONS, type EventDetail, type QuestionInput } from "@comatch/shared";
import { participant } from "../db/schema.ts";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

// Kleinstes gültiges PNG (1×1 Pixel)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function setup() {
  const { cookie } = await t.loginAs();
  const app = await t.app();
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/events",
    headers: { cookie },
    payload: { title: "Founders Night", startsAt: "2026-11-20T18:00:00+01:00" },
  });
  expect(res.statusCode).toBe(201);
  return { app, cookie, event: res.json<EventDetail>() };
}

describe("Events verwalten", () => {
  it("legt ein Event mit Beispielfragen, Kurzlink und Präsentationslink an", async () => {
    const { event, app, cookie } = await setup();
    expect(event.slug).toMatch(/^[a-z2-9]{6}$/);
    expect(event.status).toBe("draft");
    expect(event.roundDurationS).toBe(300);
    expect(event.startsAt).toBe("2026-11-20T17:00:00.000Z");
    expect(event.joinUrl).toBe(`http://comatch.test/e/${event.slug}`);
    expect(event.presenterUrl).toMatch(
      new RegExp(`^http://comatch.test/present/${event.id}\\?token=\\w{40,}`),
    );
    expect(event.questions).toEqual(DEFAULT_QUESTIONS);
    expect(event.questionsLocked).toBe(false);

    const list = await app.inject({ method: "GET", url: "/api/admin/events", headers: { cookie } });
    expect(list.json()).toEqual([expect.objectContaining({ id: event.id, participantCount: 0 })]);
  });

  it("ändert allgemeine Einstellungen und prüft Grenzen", async () => {
    const { event, app, cookie } = await setup();
    const ok = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}`,
      headers: { cookie },
      payload: {
        title: "Neu",
        startsAt: null,
        roundDurationS: 240,
        firstMatchDelayS: 20,
        primaryColor: "#FF6600",
      },
    });
    expect(ok.json()).toMatchObject({
      title: "Neu",
      roundDurationS: 240,
      primaryColor: "#FF6600",
      startsAt: null,
    });

    const bad = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}`,
      headers: { cookie },
      payload: { title: "", roundDurationS: 30, primaryColor: "rot" },
    });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().issues).sort()).toEqual(["primaryColor", "roundDurationS", "title"]);
  });

  it("speichert Fragen und macht Gegen-Optionen symmetrisch", async () => {
    const { event, app, cookie } = await setup();
    const questions: QuestionInput[] = [
      {
        text: "Was suchst du?",
        matchMode: "complementary",
        weight: 2,
        options: [
          { label: "Tech", complements: [1] },
          { label: "Business", complements: [] },
          { label: "Design", complements: [] },
        ],
      },
      DEFAULT_QUESTIONS[0]!,
      DEFAULT_QUESTIONS[2]!,
    ];
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}/questions`,
      headers: { cookie },
      payload: questions,
    });
    expect(res.statusCode).toBe(200);
    const saved = res.json<EventDetail>().questions;
    expect(saved[0]!.weight).toBe(2);
    expect(saved[0]!.options.map((o) => o.complements)).toEqual([[1], [0], []]);
    expect(saved[1]).toEqual(DEFAULT_QUESTIONS[0]);
  });

  it("lehnt ungültige Fragen ab", async () => {
    const { event, app, cookie } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}/questions`,
      headers: { cookie },
      payload: [
        { ...DEFAULT_QUESTIONS[0], options: [{ label: "Nur eine" }] },
        DEFAULT_QUESTIONS[1],
        DEFAULT_QUESTIONS[2],
      ],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues["0.options"]).toBeDefined();
  });

  it("sperrt Fragen, sobald jemand beigetreten ist", async () => {
    const { event, app, cookie } = await setup();
    await t.db.insert(participant).values({ eventId: event.id, sessionTokenHash: "x" });

    const detail = await app.inject({
      method: "GET",
      url: `/api/admin/events/${event.id}`,
      headers: { cookie },
    });
    expect(detail.json()).toMatchObject({ questionsLocked: true, participantCount: 1 });

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}/questions`,
      headers: { cookie },
      payload: DEFAULT_QUESTIONS,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("questions_locked");
  });

  it("lädt ein Logo hoch, liefert es öffentlich aus und löscht es", async () => {
    const { event, app, cookie } = await setup();
    const upload = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}/logo`,
      headers: { cookie, "content-type": "image/png" },
      payload: PNG,
    });
    expect(upload.statusCode).toBe(200);
    const logoUrl = upload.json<EventDetail>().logoUrl!;
    expect(logoUrl).toMatch(new RegExp(`^/api/events/${event.slug}/logo\\?v=\\d+$`));

    const logo = await app.inject({ method: "GET", url: logoUrl });
    expect(logo.statusCode).toBe(200);
    expect(logo.headers["content-type"]).toBe("image/png");
    expect(logo.rawPayload.equals(PNG)).toBe(true);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/admin/events/${event.id}/logo`,
      headers: { cookie },
    });
    expect(removed.json().logoUrl).toBeNull();
    expect((await app.inject({ method: "GET", url: logoUrl })).statusCode).toBe(404);
  });

  it("lehnt Dateien ab, die keine Bilder sind, und zu große Logos", async () => {
    const { event, app, cookie } = await setup();
    const fake = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}/logo`,
      headers: { cookie, "content-type": "image/png" },
      payload: Buffer.from("<svg onload=alert(1)>"),
    });
    expect(fake.statusCode).toBe(415);

    const huge = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}/logo`,
      headers: { cookie, "content-type": "image/png" },
      payload: Buffer.concat([PNG, Buffer.alloc(600 * 1024)]),
    });
    expect(huge.statusCode).toBe(413);

    const svg = await app.inject({
      method: "PUT",
      url: `/api/admin/events/${event.id}/logo`,
      headers: { cookie, "content-type": "image/svg+xml" },
      payload: "<svg/>",
    });
    expect(svg.statusCode).toBe(415);
  });

  it("erneuert den Präsentationslink", async () => {
    const { event, app, cookie } = await setup();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/events/${event.id}/presenter-token`,
      headers: { cookie },
    });
    expect(res.json().presenterUrl).not.toBe(event.presenterUrl);
  });

  it("öffnet ein Event für den Beitritt und schließt es wieder", async () => {
    const { event, app, cookie } = await setup();
    const setStatus = (status: string) =>
      app.inject({
        method: "PUT",
        url: `/api/admin/events/${event.id}/status`,
        headers: { cookie },
        payload: { status },
      });

    expect(event.status).toBe("draft");
    expect((await setStatus("open")).json()).toMatchObject({ status: "open" });
    expect((await setStatus("draft")).json()).toMatchObject({ status: "draft" });
    expect((await setStatus("running")).statusCode).toBe(400);

    await setStatus("open");
    await t.db.insert(participant).values({ eventId: event.id, sessionTokenHash: "x" });
    const back = await setStatus("draft");
    expect(back.statusCode).toBe(409);
    expect(back.json().error).toBe("has_participants");
  });

  it("löscht ein Event samt Selfies", async () => {
    const { event, app, cookie } = await setup();
    await t.storage.put(`events/${event.id}/selfies/p1/a.jpg`, Buffer.from("x"), "image/jpeg");
    await t.storage.put("events/anderes/selfies/p2/b.jpg", Buffer.from("x"), "image/jpeg");
    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/events/${event.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
    const gone = await app.inject({
      method: "GET",
      url: `/api/admin/events/${event.id}`,
      headers: { cookie },
    });
    expect(gone.statusCode).toBe(404);
    expect(t.storage.keys()).toEqual(["events/anderes/selfies/p2/b.jpg"]);
  });
});
