import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AdminMe, EventSummary } from "@comatch/shared";
import { account, adminUser, authToken } from "../db/schema.ts";
import { runRetention, UNVERIFIED_ACCOUNT_TTL_MS } from "../events/retention.ts";
import { RETENTION_MS, useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

const PASSWORD = "ein-gutes-passwort";
let ip = 0;
/** Jede Anfrage von einer eigenen Adresse, damit die Limits je IP nicht über Tests hinweg greifen. */
const address = () => `10.97.${(ip += 1) >> 8}.${ip & 255}`;

async function signup(email = "neu@test.local", accountName = "Startup Haus") {
  return (await t.app()).inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: { email, password: PASSWORD, accountName, acceptTerms: true },
    remoteAddress: address(),
  });
}
async function login(email = "neu@test.local", password = PASSWORD) {
  return (await t.app()).inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
    remoteAddress: address(),
  });
}
const verifyTokenFromMail = () => t.mailer.sent.at(-1)!.text.match(/\/admin\/verify\/(\S+)/)![1]!;
async function verify(token: string) {
  return (await t.app()).inject({
    method: "POST",
    url: `/api/auth/verify/${token}`,
    remoteAddress: address(),
  });
}

describe("Registrierung", () => {
  it("legt ein eigenes Konto an, das nach der Bestätigung per Mail nutzbar ist", async () => {
    const app = await t.app();
    expect((await signup(" Neu@Test.local ")).statusCode).toBe(204);
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]).toMatchObject({ to: "neu@test.local" });

    const verified = await verify(verifyTokenFromMail());
    expect(verified.statusCode).toBe(200);
    expect(verified.json<AdminMe>()).toMatchObject({
      email: "neu@test.local",
      accountName: "Startup Haus",
      role: "owner",
    });
    const cookie = verified.cookies.find((c) => c.name === "comatch_admin")!;
    const headers = { cookie: `comatch_admin=${cookie.value}` };

    // Ein frisches Konto ist leer und sieht nichts von anderen.
    await t.createEvent("open", "fremd", "Anderes Konto");
    const events = await app.inject({ method: "GET", url: "/api/admin/events", headers });
    expect(events.json<EventSummary[]>()).toEqual([]);
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/events",
      headers,
      payload: { title: "Erstes Event", startsAt: null },
    });
    expect(created.statusCode).toBe(201);

    expect((await login()).statusCode).toBe(200);
    // Der Link gilt nur einmal.
    expect((await verify(verifyTokenFromMail())).statusCode).toBe(404);
  });

  it("lässt vor der Bestätigung nicht anmelden und schickt den Link erneut", async () => {
    await signup();
    const first = verifyTokenFromMail();

    const res = await login();
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("email_unverified");
    expect(res.cookies).toEqual([]);
    expect(t.mailer.sent).toHaveLength(2);

    // Mit falschem Passwort gibt es weder Hinweis noch Mail.
    const wrong = await login("neu@test.local", "falsches-passwort");
    expect(wrong.statusCode).toBe(401);
    expect(t.mailer.sent).toHaveLength(2);

    // Beide Links funktionieren, danach keiner mehr.
    expect((await verify(verifyTokenFromMail())).statusCode).toBe(200);
    expect((await verify(first)).statusCode).toBe(404);
  });

  it("verrät nicht, ob eine E-Mail schon registriert ist", async () => {
    await t.createAdmin("da@test.local");
    const res = await signup("da@test.local", "Übernahme");
    expect(res.statusCode).toBe(204);
    expect(t.mailer.sent).toEqual([]);
    expect(await t.db.$count(account)).toBe(1);
    // Das bestehende Passwort bleibt.
    expect((await login("da@test.local", PASSWORD)).statusCode).toBe(401);
    expect((await login("da@test.local", "richtig-langes-passwort")).statusCode).toBe(200);
  });

  it("legt bei erneuter Registrierung vor der Bestätigung kein zweites Konto an", async () => {
    await signup();
    await signup();
    expect(await t.db.$count(account)).toBe(1);
    expect(t.mailer.sent).toHaveLength(2);
  });

  it("prüft die Eingaben", async () => {
    const res = await (
      await t.app()
    ).inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "keine-mail", password: "kurz", accountName: " " },
      remoteAddress: address(),
    });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().issues).sort()).toEqual([
      "acceptTerms",
      "accountName",
      "email",
      "password",
    ]);
    expect(await t.db.$count(account)).toBe(0);
  });

  it("bestätigt die E-Mail auch über „Passwort vergessen“", async () => {
    const app = await t.app();
    await signup();
    await app.inject({
      method: "POST",
      url: "/api/auth/forgot",
      payload: { email: "neu@test.local" },
      remoteAddress: address(),
    });
    const token = t.mailer.sent.at(-1)!.text.match(/\/admin\/reset\/(\S+)/)![1]!;
    const reset = await app.inject({
      method: "POST",
      url: `/api/auth/reset/${token}`,
      payload: { password: "noch-ein-passwort" },
      remoteAddress: address(),
    });
    expect(reset.statusCode).toBe(200);
    expect((await login("neu@test.local", "noch-ein-passwort")).statusCode).toBe(200);
  });

  it("begrenzt Registrierungen je Adresse", async () => {
    const app = await t.app();
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: `p${i}@test.local`, password: PASSWORD, accountName: "X", acceptTerms: true },
        remoteAddress: "10.96.0.1",
      });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([204, 204, 204, 204, 204, 429]);
  });

  it("löscht nie bestätigte Konten nach einer Woche, alle anderen nicht", async () => {
    const run = (now: Date) =>
      runRetention({ db: t.db, storage: t.storage, live: t.live, retentionMs: RETENTION_MS, now: () => now });
    await signup("geist@test.local", "Nie bestätigt");
    await signup("echt@test.local", "Bestätigt");
    await verify(verifyTokenFromMail());
    await t.createAdmin("alt@test.local", undefined, "Bestand");
    await t.account("Leer ohne Personen");
    const names = async () =>
      (await t.db.select({ name: account.name }).from(account)).map((a) => a.name).sort();

    await run(new Date(Date.now() + UNVERIFIED_ACCOUNT_TTL_MS - 60_000));
    expect(await names()).toHaveLength(4);

    await run(new Date(Date.now() + UNVERIFIED_ACCOUNT_TTL_MS + 60_000));
    expect(await names()).toEqual(["Bestand", "Bestätigt", "Leer ohne Personen"]);
    expect(await t.db.$count(adminUser, eq(adminUser.email, "geist@test.local"))).toBe(0);
    expect(await t.db.$count(authToken)).toBe(0);
  });
});

describe("Registrierung geschlossen", () => {
  it("meldet der Oberfläche, ob die Registrierung offen ist", async () => {
    const res = await (await t.app()).inject({ method: "GET", url: "/api/config" });
    expect(res.json()).toEqual({ signupOpen: true });
  });
});
