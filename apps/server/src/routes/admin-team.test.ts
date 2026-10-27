import { describe, expect, it } from "vitest";
import type { InviteCreated } from "@comatch/shared";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

const tokenFrom = (invite: InviteCreated) => invite.acceptUrl.split("/invite/")[1]!;

describe("Team und Einladungen", () => {
  it("lädt ein, Einladung wird angenommen und meldet die neue Person an", async () => {
    const { cookie } = await t.loginAs();
    const app = await t.app();

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/invites",
      headers: { cookie },
      payload: { email: "Neu@Test.local" },
    });
    expect(created.statusCode).toBe(201);
    const invite = created.json<InviteCreated>();
    expect(invite.email).toBe("neu@test.local");
    expect(invite.acceptUrl).toMatch(/^http:\/\/comatch\.test\/invite\/.+/);

    const preview = await app.inject({ method: "GET", url: `/api/invites/${tokenFrom(invite)}` });
    expect(preview.json()).toMatchObject({ email: "neu@test.local" });

    const tooShort = await app.inject({
      method: "POST",
      url: `/api/invites/${tokenFrom(invite)}/accept`,
      payload: { password: "kurz" },
    });
    expect(tooShort.statusCode).toBe(400);
    expect(tooShort.json().issues.password).toBeDefined();

    const accepted = await app.inject({
      method: "POST",
      url: `/api/invites/${tokenFrom(invite)}/accept`,
      payload: { password: "ein-gutes-passwort" },
    });
    expect(accepted.statusCode).toBe(201);
    const newCookie = accepted.cookies.find((c) => c.name === "comatch_admin")!;
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `comatch_admin=${newCookie.value}` },
    });
    expect(me.json()).toMatchObject({ email: "neu@test.local" });

    // Einladungen sind nur einmal gültig.
    const again = await app.inject({ method: "GET", url: `/api/invites/${tokenFrom(invite)}` });
    expect(again.statusCode).toBe(404);

    const team = await app.inject({ method: "GET", url: "/api/admin/team", headers: { cookie } });
    expect(team.json().admins.map((a: { email: string }) => a.email)).toEqual([
      "admin@test.local",
      "neu@test.local",
    ]);
    expect(team.json().admins[1].invitedByEmail).toBe("admin@test.local");
    expect(team.json().invites).toEqual([]);
  });

  it("lädt bestehende Admins nicht erneut ein", async () => {
    const { cookie } = await t.loginAs();
    const res = await (
      await t.app()
    ).inject({
      method: "POST",
      url: "/api/admin/invites",
      headers: { cookie },
      payload: { email: "admin@test.local" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("verhindert, dass man sich selbst entfernt", async () => {
    const { cookie, admin } = await t.loginAs();
    const res = await (
      await t.app()
    ).inject({
      method: "DELETE",
      url: `/api/admin/admins/${admin.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });
});
