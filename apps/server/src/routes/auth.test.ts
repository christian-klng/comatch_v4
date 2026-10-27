import { describe, expect, it } from "vitest";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

describe("Admin-Login", () => {
  it("meldet mit richtigem Passwort an und setzt ein httpOnly-Cookie", async () => {
    const admin = await t.createAdmin("Chris@Test.local".toLowerCase());
    const res = await (
      await t.app()
    ).inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "  CHRIS@test.local ", password: admin.password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: admin.id, email: "chris@test.local" });
    const cookie = res.cookies.find((c) => c.name === "comatch_admin");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });

  it("lehnt falsche Passwörter und unbekannte E-Mails gleich ab", async () => {
    await t.createAdmin();
    const app = await t.app();
    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "falsch" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "niemand@test.local", password: "falsch" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it("schützt /api/admin und /api/auth/me ohne Session", async () => {
    const app = await t.app();
    expect((await app.inject({ method: "GET", url: "/api/admin/events" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/auth/me" })).statusCode).toBe(401);
  });

  it("liefert den angemeldeten Admin und meldet wieder ab", async () => {
    const { cookie } = await t.loginAs();
    const app = await t.app();
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ email: "admin@test.local" });

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect(logout.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });
});
