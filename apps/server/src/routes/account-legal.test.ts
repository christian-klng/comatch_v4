import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { TERMS_VERSION, type EventDetail, type PublicEvent } from "@comatch/shared";
import { loadConfig } from "../config.ts";
import { account, adminUser, event } from "../db/schema.ts";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

const NO_LEGAL = { legalName: null, legalAddress: null, legalEmail: null };

async function setup(values: Partial<typeof account.$inferInsert> = {}) {
  const accountId = await t.account();
  if (Object.keys(values).length > 0) {
    await t.db.update(account).set(values).where(eq(account.id, accountId));
  }
  const { cookie, admin } = await t.loginAs();
  const app = await t.app();
  const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url: `/api/admin${url}`, headers: { cookie }, payload });
  return { app, accountId, cookie, admin, call };
}

describe("Veranstalter-Angaben", () => {
  it("öffnet ein Event erst, wenn der Veranstalter eingetragen ist", async () => {
    const { call } = await setup(NO_LEGAL);
    const created = (await call("POST", "/events", { title: "Abend", startsAt: null })).json<EventDetail>();

    const blocked = await call("PUT", `/events/${created.id}/status`, { status: "open" });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("organizer_missing");

    await call("PUT", "/account", {
      name: "Startup Haus",
      legalName: "Startup Haus GmbH",
      legalAddress: "Weg 1, 10115 Berlin",
      legalEmail: "hallo@startup.test",
    });
    const opened = await call("PUT", `/events/${created.id}/status`, { status: "open" });
    expect(opened.statusCode).toBe(200);
    expect(opened.json<EventDetail>().status).toBe("open");
  });

  it("nennt Teilnehmenden den Veranstalter des Events", async () => {
    const { app } = await setup();
    await t.createEvent("open", "mit");
    const pub = await app.inject({ method: "GET", url: "/api/events/mit" });
    expect(pub.json<PublicEvent>().organizer).toEqual({
      name: "Test GmbH",
      address: "Teststraße 1, 12345 Berlin",
      email: "kontakt@test.local",
    });
  });

  it("lässt Konten des Betreibers ohne eigene Angaben öffnen (es gilt das Impressum)", async () => {
    const { app, call } = await setup({ ...NO_LEGAL, legalFromOperator: true });
    const created = (await call("POST", "/events", { title: "Abend", startsAt: null })).json<EventDetail>();
    expect((await call("PUT", `/events/${created.id}/status`, { status: "open" })).statusCode).toBe(200);
    const pub = await app.inject({ method: "GET", url: `/api/events/${created.slug}` });
    expect(pub.json<PublicEvent>().organizer).toBeNull();
  });
});

describe("Zustimmung bei der Registrierung", () => {
  const signup = async (payload: object) =>
    (await t.app()).inject({ method: "POST", url: "/api/auth/signup", payload });
  const input = { email: "neu@test.local", password: "ein-gutes-passwort", accountName: "Neu" };

  it("verlangt die Zustimmung und speichert Zeitpunkt und Fassung", async () => {
    const without = await signup(input);
    expect(without.statusCode).toBe(400);
    expect(without.json().issues.acceptTerms).toBeDefined();
    expect((await signup({ ...input, acceptTerms: false })).statusCode).toBe(400);
    expect(await t.db.$count(account)).toBe(0);

    const before = Date.now();
    expect((await signup({ ...input, acceptTerms: true })).statusCode).toBe(204);
    const [row] = await t.db.select().from(account);
    expect(row!.termsVersion).toBe(TERMS_VERSION);
    expect(row!.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // Selbst registrierte Konten müssen ihre Veranstalter-Angaben selbst eintragen.
    expect(row!.legalFromOperator).toBe(false);
  });

  it("öffnet die Registrierung im Produktivbetrieb nicht mit Entwurfstexten", () => {
    const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db", SIGNUP_MODE: "open" };
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/SIGNUP_MODE/);
    expect(loadConfig({ ...base, NODE_ENV: "development" }).SIGNUP_MODE).toBe("open");
    expect(loadConfig({ ...base, NODE_ENV: "production", SIGNUP_MODE: "closed" }).SIGNUP_MODE).toBe("closed");
  });
});

describe("Konto löschen", () => {
  it("löscht Events, Fotos, Mitglieder und Einladungen und lässt andere Konten in Ruhe", async () => {
    const { call, cookie, app } = await setup();
    const own = await t.createEvent("ended", "meins");
    const foreign = await t.createEvent("open", "fremd", "Anderes Konto");
    await t.createAdmin("mitglied@test.local");
    await t.createAdmin("fremd@test.local", undefined, "Anderes Konto");
    await call("POST", "/invites", { email: "offen@test.local" });
    await t.storage.put(`events/${own.id}/selfies/p/1.jpg`, Buffer.from("x"), "image/jpeg");
    await t.storage.put(`events/${foreign.id}/selfies/p/1.jpg`, Buffer.from("x"), "image/jpeg");

    const wrong = await call("DELETE", "/account", { confirmName: "Falsch" });
    expect(wrong.statusCode).toBe(400);
    expect(await t.db.$count(account)).toBe(2);

    const done = await call("DELETE", "/account", { confirmName: "Test-Konto" });
    expect(done.statusCode).toBe(204);

    expect((await t.db.select({ name: account.name }).from(account)).map((a) => a.name)).toEqual([
      "Anderes Konto",
    ]);
    expect((await t.db.select({ slug: event.slug }).from(event)).map((e) => e.slug)).toEqual(["fremd"]);
    expect((await t.db.select({ email: adminUser.email }).from(adminUser)).map((a) => a.email)).toEqual([
      "fremd@test.local",
    ]);
    expect(t.storage.keys()).toEqual([`events/${foreign.id}/selfies/p/1.jpg`]);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it("geht nicht, solange ein Event läuft, und nur für die*den Inhaber*in", async () => {
    const { call, app } = await setup();
    const { id } = await t.createEvent("running", "live");
    const blocked = await call("DELETE", "/account", { confirmName: "Test-Konto" });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("event_live");

    await t.db.update(event).set({ status: "ended" }).where(eq(event.id, id));
    const member = await t.loginAs("mitglied@test.local");
    const denied = await app.inject({
      method: "DELETE",
      url: "/api/admin/account",
      headers: { cookie: member.cookie },
      payload: { confirmName: "Test-Konto" },
    });
    expect(denied.statusCode).toBe(403);
    expect(await t.db.$count(account)).toBe(1);
  });
});
