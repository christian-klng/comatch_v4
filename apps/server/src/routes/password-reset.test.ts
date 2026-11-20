import { describe, expect, it } from "vitest";
import type { AdminMe, InviteCreated } from "@comatch/shared";
import { authToken } from "../db/schema.ts";
import { runRetention } from "../events/retention.ts";
import { RETENTION_MS, useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

/** Link aus der letzten Mail, als Pfad der API. */
const tokenFromMail = () => t.mailer.sent.at(-1)!.text.match(/\/admin\/reset\/(\S+)/)![1]!;

let ip = 0;
/** Jede Anfrage von einer eigenen Adresse, damit das Limit je IP nicht über Tests hinweg greift. */
async function forgot(email: string) {
  ip += 1;
  return (await t.app()).inject({
    method: "POST",
    url: "/api/auth/forgot",
    payload: { email },
    remoteAddress: `10.98.0.${ip}`,
  });
}

describe("Passwort vergessen", () => {
  it("schickt einen Link, setzt das Passwort neu und meldet alle alten Sitzungen ab", async () => {
    const { cookie: oldCookie, admin } = await t.loginAs("chris@test.local");
    const app = await t.app();

    expect((await forgot(" Chris@Test.local ")).statusCode).toBe(204);
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]).toMatchObject({ to: "chris@test.local" });
    expect(t.mailer.sent[0]!.text).toContain("http://comatch.test/admin/reset/");
    const token = tokenFromMail();

    expect((await app.inject({ method: "GET", url: `/api/auth/reset/${token}` })).statusCode).toBe(204);
    const tooShort = await app.inject({
      method: "POST",
      url: `/api/auth/reset/${token}`,
      payload: { password: "kurz" },
    });
    expect(tooShort.statusCode).toBe(400);

    const reset = await app.inject({
      method: "POST",
      url: `/api/auth/reset/${token}`,
      payload: { password: "ein-neues-passwort" },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json<AdminMe>()).toMatchObject({ id: admin.id, email: "chris@test.local" });
    expect(reset.cookies.find((c) => c.name === "comatch_admin")).toBeDefined();

    const stale = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: oldCookie } });
    expect(stale.statusCode).toBe(401);

    const login = (password: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "chris@test.local", password },
        remoteAddress: "10.98.1.1",
      });
    expect((await login(admin.password)).statusCode).toBe(401);
    expect((await login("ein-neues-passwort")).statusCode).toBe(200);

    // Der Link gilt nur einmal.
    expect((await app.inject({ method: "GET", url: `/api/auth/reset/${token}` })).statusCode).toBe(404);
  });

  it("verrät nicht, ob eine E-Mail registriert ist", async () => {
    expect((await forgot("niemand@test.local")).statusCode).toBe(204);
    expect(t.mailer.sent).toEqual([]);
    expect(await t.db.$count(authToken)).toBe(0);
  });

  it("antwortet auch dann gleich, wenn der Mailserver ausfällt", async () => {
    await t.createAdmin("chris@test.local");
    t.mailer.failNext = true;
    expect((await forgot("chris@test.local")).statusCode).toBe(204);
  });

  it("lässt mit dem Zurücksetzen alle weiteren offenen Links verfallen", async () => {
    await t.createAdmin("chris@test.local");
    const app = await t.app();
    await forgot("chris@test.local");
    const first = tokenFromMail();
    await forgot("chris@test.local");
    const second = tokenFromMail();
    expect(first).not.toBe(second);

    const reset = await app.inject({
      method: "POST",
      url: `/api/auth/reset/${second}`,
      payload: { password: "ein-neues-passwort" },
    });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/auth/reset/${first}` })).statusCode).toBe(404);
  });

  it("lehnt abgelaufene Links ab und räumt sie auf", async () => {
    await t.createAdmin("chris@test.local");
    const app = await t.app();
    await forgot("chris@test.local");
    const token = tokenFromMail();
    await t.db.update(authToken).set({ expiresAt: new Date(Date.now() - 1000) });

    const reset = await app.inject({
      method: "POST",
      url: `/api/auth/reset/${token}`,
      payload: { password: "ein-neues-passwort" },
    });
    expect(reset.statusCode).toBe(404);
    expect(reset.json().error).toBe("reset_invalid");

    await runRetention({ db: t.db, storage: t.storage, live: t.live, retentionMs: RETENTION_MS });
    expect(await t.db.$count(authToken)).toBe(0);
  });

  it("begrenzt die Anfragen je Adresse", async () => {
    const app = await t.app();
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/forgot",
        payload: { email: "niemand@test.local" },
        remoteAddress: "10.98.2.1",
      });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([204, 204, 204, 204, 204, 429]);
  });
});

describe("Einladung per Mail", () => {
  const invite = async (cookie: string) =>
    (await t.app()).inject({
      method: "POST",
      url: "/api/admin/invites",
      headers: { cookie },
      payload: { email: "neu@test.local" },
    });

  it("verschickt den Einladungslink mit Kontoname und Absender", async () => {
    const { cookie } = await t.loginAs();
    const res = await invite(cookie);
    const created = res.json<InviteCreated>();
    expect(created.mailed).toBe(true);
    expect(t.mailer.sent).toHaveLength(1);
    const mail = t.mailer.sent[0]!;
    expect(mail.to).toBe("neu@test.local");
    expect(mail.subject).toContain("Test-Konto");
    expect(mail.text).toContain("admin@test.local");
    expect(mail.text).toContain(created.acceptUrl);
  });

  it("legt die Einladung auch an, wenn die Mail scheitert", async () => {
    const { cookie } = await t.loginAs();
    t.mailer.failNext = true;
    const res = await invite(cookie);
    expect(res.statusCode).toBe(201);
    expect(res.json<InviteCreated>()).toMatchObject({ mailed: false });
    expect(res.json<InviteCreated>().acceptUrl).toMatch(/\/invite\/.+/);
  });
});
