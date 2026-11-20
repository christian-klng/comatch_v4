import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { PublicEvent } from "@comatch/shared";
import { account, event } from "../db/schema.ts";
import { useTestApp } from "../../test/helpers.ts";

// Für die ganze Instanz: höchstens drei Events gleichzeitig.
const t = useTestApp({ maxLiveEvents: 3 });

async function join(slug: string) {
  const app = await t.app();
  const ev = (await app.inject({ method: "GET", url: `/api/events/${slug}` })).json<PublicEvent>();
  return app.inject({
    method: "POST",
    url: `/api/events/${slug}/join`,
    payload: { answers: ev.questions.map((q) => q.options[0]!.id), consent: true },
  });
}

const setAccount = async (name: string, values: Partial<typeof account.$inferInsert>) =>
  t.db
    .update(account)
    .set(values)
    .where(eq(account.id, await t.account(name)));

describe("Grenzen je Konto", () => {
  it("nimmt nur so viele Teilnehmende auf, wie das Konto erlaubt", async () => {
    await t.createEvent("open", "klein", "Konto A");
    await setAccount("Konto A", { maxParticipants: 2 });
    expect((await join("klein")).statusCode).toBe(201);
    expect((await join("klein")).statusCode).toBe(201);
    const full = await join("klein");
    expect(full.statusCode).toBe(409);
    expect(full.json().error).toBe("event_full");

    // Andere Konten sind davon nicht betroffen.
    await t.createEvent("open", "gross", "Konto B");
    for (let i = 0; i < 3; i += 1) expect((await join("gross")).statusCode).toBe(201);
  });

  it("startet nur so viele Events gleichzeitig, wie das Konto erlaubt", async () => {
    const app = await t.app();
    const { cookie } = await t.loginAs("a@test.local", "Konto A");
    const start = (id: string, action = "start") =>
      app.inject({
        method: "POST",
        url: `/api/admin/events/${id}/control`,
        headers: { cookie },
        payload: { action },
      });
    const first = await t.createEvent("open", "eins", "Konto A");
    const second = await t.createEvent("open", "zwei", "Konto A");
    const third = await t.createEvent("open", "drei", "Konto A");

    expect((await start(first.id)).statusCode).toBe(200);
    expect((await start(second.id)).statusCode).toBe(200);
    // Auch pausierte Events zählen.
    expect((await start(second.id, "pause")).statusCode).toBe(200);
    const blocked = await start(third.id);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("live_limit");
    const [row] = await t.db.select({ status: event.status }).from(event).where(eq(event.id, third.id));
    expect(row!.status).toBe("open");

    // Nach dem Ende eines Events ist wieder Platz.
    expect((await start(first.id, "end")).statusCode).toBe(200);
    expect((await start(third.id)).statusCode).toBe(200);
  });

  it("begrenzt die gleichzeitig laufenden Events der ganzen Instanz", async () => {
    const app = await t.app();
    const codes: number[] = [];
    for (const name of ["A", "B", "C", "D"]) {
      const { id } = await t.createEvent("open", `ev-${name.toLowerCase()}`, `Konto ${name}`);
      const { cookie } = await t.loginAs(`${name.toLowerCase()}@test.local`, `Konto ${name}`);
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/events/${id}/control`,
        headers: { cookie },
        payload: { action: "start" },
      });
      codes.push(res.statusCode);
      if (res.statusCode !== 200) expect(res.json().error).toBe("instance_busy");
    }
    expect(codes).toEqual([200, 200, 200, 409]);
  });
});

describe("Gesperrtes Konto", () => {
  it("sperrt Login, laufende Sitzungen und den Beitritt aus und lässt sich wieder öffnen", async () => {
    const app = await t.app();
    await t.createEvent("open", "gesperrt", "Konto A");
    const { cookie, admin } = await t.loginAs("a@test.local", "Konto A");
    const other = await t.loginAs("b@test.local", "Konto B");
    const me = (c: string) => app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: c } });
    const login = () =>
      app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "a@test.local", password: admin.password },
        remoteAddress: "10.95.0.1",
      });

    await setAccount("Konto A", { status: "suspended" });
    expect((await me(cookie)).statusCode).toBe(401);
    const denied = await login();
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("account_suspended");
    expect(denied.cookies).toEqual([]);

    const pub = await app.inject({ method: "GET", url: "/api/events/gesperrt" });
    expect(pub.json<PublicEvent>().joinable).toBe(false);
    const joined = await join("gesperrt");
    expect(joined.statusCode).toBe(409);
    expect(joined.json().error).toBe("event_not_joinable");

    // Andere Konten merken nichts.
    expect((await me(other.cookie)).statusCode).toBe(200);

    await setAccount("Konto A", { status: "active" });
    expect((await me(cookie)).statusCode).toBe(200);
    expect((await login()).statusCode).toBe(200);
    expect((await join("gesperrt")).statusCode).toBe(201);
  });
});
