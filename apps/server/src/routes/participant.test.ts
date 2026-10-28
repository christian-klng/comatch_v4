import { describe, expect, it } from "vitest";
import type { JoinResult, ParticipantMe, PublicEvent } from "@comatch/shared";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

// Nur die Signatur zählt für die Typ-Erkennung; der Rest muss kein gültiges Bild sein.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

async function publicEvent(slug: string) {
  const res = await (await t.app()).inject({ method: "GET", url: `/api/events/${slug}` });
  return res.json<PublicEvent>();
}

async function join(slug: string, answers?: string[]) {
  const ev = await publicEvent(slug);
  return (await t.app()).inject({
    method: "POST",
    url: `/api/events/${slug}/join`,
    payload: { answers: answers ?? ev.questions.map((q) => q.options[0]!.id), consent: true },
  });
}

async function joined(slug = "testev") {
  const res = await join(slug);
  expect(res.statusCode).toBe(201);
  const body = res.json<JoinResult>();
  return { ...body, auth: { authorization: `Bearer ${body.token}` } };
}

async function uploadSelfie(auth: Record<string, string>, payload: Buffer = JPEG, type = "image/jpeg") {
  return (await t.app()).inject({
    method: "PUT",
    url: "/api/participant/selfie",
    headers: { ...auth, "content-type": type },
    payload,
  });
}

describe("GET /api/events/:slug", () => {
  it("liefert Titel und Fragen ohne Matching-Konfiguration", async () => {
    await t.createEvent("open");
    const ev = await publicEvent("testev");
    expect(ev).toMatchObject({ slug: "testev", title: "Test-Event", status: "open", joinable: true });
    expect(ev.questions).toHaveLength(3);
    expect(ev.questions[0]!.options[0]).toEqual({ id: expect.any(String), label: expect.any(String) });
    expect(JSON.stringify(ev)).not.toMatch(/matchMode|complements|weight/);
  });

  it("antwortet mit 404 für unbekannte Events", async () => {
    const res = await (await t.app()).inject({ method: "GET", url: "/api/events/gibtsnicht" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/events/:slug/join", () => {
  it("legt eine Person mit Antworten an und gibt ein Token zurück", async () => {
    await t.createEvent("open");
    const ev = await publicEvent("testev");
    const answers = ev.questions.map((q) => q.options.at(-1)!.id);
    const res = await join("testev", answers);

    expect(res.statusCode).toBe(201);
    const body = res.json<JoinResult>();
    expect(body.token.length).toBeGreaterThan(30);
    expect(body.participant).toMatchObject({
      eventSlug: "testev",
      status: "onboarding",
      selfieUrl: null,
      answers,
    });
  });

  it("lehnt Entwürfe und beendete Events ab", async () => {
    await t.createEvent("draft", "entwurf");
    await t.createEvent("ended", "vorbei");
    expect((await join("entwurf")).json()).toMatchObject({ error: "event_not_joinable" });
    expect((await join("vorbei")).statusCode).toBe(409);
  });

  it("verlangt die Einwilligung", async () => {
    await t.createEvent("open");
    const ev = await publicEvent("testev");
    const res = await (
      await t.app()
    ).inject({
      method: "POST",
      url: "/api/events/testev/join",
      payload: { answers: ev.questions.map((q) => q.options[0]!.id), consent: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toHaveProperty("consent");
  });

  it("erkennt Antworten, die nicht zur jeweiligen Frage gehören", async () => {
    await t.createEvent("open");
    const ev = await publicEvent("testev");
    // Antworten in falscher Reihenfolge: Option von Frage 2 bei Frage 1 usw.
    const answers = [ev.questions[1]!, ev.questions[2]!, ev.questions[0]!].map((q) => q.options[0]!.id);
    const res = await join("testev", answers);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("questions_changed");
  });
});

describe("/api/participant", () => {
  it("lädt den eigenen Zustand nur mit gültigem Token", async () => {
    await t.createEvent("open");
    const { auth, participant } = await joined();
    const app = await t.app();

    const me = await app.inject({ method: "GET", url: "/api/participant", headers: auth });
    expect(me.json<ParticipantMe>()).toEqual(participant);

    const without = await app.inject({ method: "GET", url: "/api/participant" });
    const wrong = await app.inject({
      method: "GET",
      url: "/api/participant",
      headers: { authorization: "Bearer falsch" },
    });
    expect(without.statusCode).toBe(401);
    expect(wrong.json().error).toBe("participant_unknown");
  });

  it("nimmt mit dem ersten Selfie die Person in den Pool auf", async () => {
    await t.createEvent("open");
    const { auth } = await joined();

    const res = await uploadSelfie(auth);
    expect(res.statusCode).toBe(200);
    const me = res.json<ParticipantMe>();
    expect(me.status).toBe("pool");
    expect(me.selfieUrl).toMatch(/^\/api\/media\/events\/.+\.jpg\?exp=\d+&sig=/);

    const image = await (await t.app()).inject({ method: "GET", url: me.selfieUrl! });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/jpeg");
    expect(image.rawPayload.equals(JPEG)).toBe(true);
  });

  it("ersetzt ein altes Selfie und löscht es aus dem Speicher", async () => {
    await t.createEvent("open");
    const { auth, participant } = await joined();
    const first = (await uploadSelfie(auth)).json<ParticipantMe>();
    const second = (await uploadSelfie(auth)).json<ParticipantMe>();

    expect(second.status).toBe("pool");
    expect(second.selfieUrl).not.toBe(first.selfieUrl);
    expect(t.storage.keys().filter((k) => k.includes(participant.id))).toHaveLength(1);
  });

  it("lehnt Dateien ab, die keine Bilder sind", async () => {
    await t.createEvent("open");
    const { auth } = await joined();
    const res = await uploadSelfie(auth, Buffer.from("<svg onload=alert(1)>"), "image/png");
    expect(res.statusCode).toBe(415);
  });

  it("lehnt zu große Selfies ab", async () => {
    await t.createEvent("open");
    const { auth } = await joined();
    const big = Buffer.concat([JPEG, Buffer.alloc(1024 * 1024)]);
    expect((await uploadSelfie(auth, big)).statusCode).toBe(413);
  });

  it("löscht beim Austritt Person, Antworten und Selfie", async () => {
    await t.createEvent("open");
    const { auth, participant } = await joined();
    await uploadSelfie(auth);
    const app = await t.app();

    const res = await app.inject({ method: "DELETE", url: "/api/participant", headers: auth });
    expect(res.statusCode).toBe(204);
    expect(t.storage.keys().filter((k) => k.includes(participant.id))).toEqual([]);
    const after = await app.inject({ method: "GET", url: "/api/participant", headers: auth });
    expect(after.statusCode).toBe(401);
  });
});

describe("Rate-Limit", () => {
  it("begrenzt je Person statt je IP, damit ein ganzes Event-WLAN nicht blockiert", async () => {
    await t.createEvent("open");
    const a = await joined();
    const b = await joined();
    // Alle Anfragen kommen von derselben Adresse; nur die Person mit zu vielen Uploads wird gebremst.
    for (let i = 0; i < 10; i++) expect((await uploadSelfie(a.auth)).statusCode).toBe(200);
    const limited = await uploadSelfie(a.auth);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: "rate_limited" });
    expect(limited.json().message).toMatch(/^Zu viele Anfragen/);
    expect((await uploadSelfie(b.auth)).statusCode).toBe(200);
  });
});

describe("GET /api/media/*", () => {
  it("verweigert manipulierte oder abgelaufene Links", async () => {
    await t.createEvent("open");
    const { auth } = await joined();
    const { selfieUrl } = (await uploadSelfie(auth)).json<ParticipantMe>();
    const app = await t.app();

    const tampered = selfieUrl!.replace(/sig=./, "sig=X");
    expect((await app.inject({ method: "GET", url: tampered })).statusCode).toBe(403);

    const url = new URL(selfieUrl!, "http://x");
    const key = url.pathname.replace("/api/media/", "");
    const expired = t.media.url(key, Date.now() - 2 * 60 * 60 * 1000);
    expect((await app.inject({ method: "GET", url: expired })).statusCode).toBe(403);

    const otherKey = t.media.url("events/anderes/bild.jpg");
    expect((await app.inject({ method: "GET", url: otherKey })).statusCode).toBe(404);
  });
});
