import { describe, expect, it } from "vitest";
import type { AccountDetail, AdminMe } from "@comatch/shared";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

async function ownerAndMember() {
  const owner = await t.loginAs("inhaberin@test.local");
  const member = await t.loginAs("mitglied@test.local");
  return { app: await t.app(), owner, member };
}

describe("Konto und Rollen", () => {
  it("zeigt das Konto allen und lässt nur die*den Inhaber*in ändern", async () => {
    const { app, owner, member } = await ownerAndMember();
    const input = {
      name: "  Startup Haus  ",
      legalName: "Startup Haus GmbH",
      legalAddress: "Weg 1, 10115 Berlin",
      legalEmail: "",
    };

    const denied = await app.inject({
      method: "PUT",
      url: "/api/admin/account",
      headers: { cookie: member.cookie },
      payload: input,
    });
    expect(denied.statusCode).toBe(403);

    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/account",
      headers: { cookie: owner.cookie },
      payload: input,
    });
    expect(saved.statusCode).toBe(200);
    const expected = { name: "Startup Haus", legalName: "Startup Haus GmbH", legalEmail: null };
    expect(saved.json<AccountDetail>()).toMatchObject(expected);

    const seen = await app.inject({
      method: "GET",
      url: "/api/admin/account",
      headers: { cookie: member.cookie },
    });
    expect(seen.json<AccountDetail>()).toMatchObject(expected);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: member.cookie } });
    expect(me.json<AdminMe>()).toMatchObject({ accountName: "Startup Haus", role: "member" });

    const bad = await app.inject({
      method: "PUT",
      url: "/api/admin/account",
      headers: { cookie: owner.cookie },
      payload: { ...input, name: " ", legalEmail: "keine-mail" },
    });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().issues).sort()).toEqual(["legalEmail", "name"]);
  });

  it("lässt Mitglieder das Team sehen, aber nicht verändern", async () => {
    const { app, owner, member } = await ownerAndMember();
    const team = await app.inject({
      method: "GET",
      url: "/api/admin/team",
      headers: { cookie: member.cookie },
    });
    expect(team.json().admins.map((a: { role: string }) => a.role)).toEqual(["owner", "member"]);

    const invite = await app.inject({
      method: "POST",
      url: "/api/admin/invites",
      headers: { cookie: member.cookie },
      payload: { email: "neu@test.local" },
    });
    expect(invite.statusCode).toBe(403);
    const remove = await app.inject({
      method: "DELETE",
      url: `/api/admin/admins/${owner.admin.id}`,
      headers: { cookie: member.cookie },
    });
    expect(remove.statusCode).toBe(403);
  });

  it("übergibt das Konto an ein Mitglied", async () => {
    const { app, owner, member } = await ownerAndMember();
    const transfer = (cookie: string, adminId: string) =>
      app.inject({
        method: "POST",
        url: "/api/admin/account/owner",
        headers: { cookie },
        payload: { adminId },
      });

    expect((await transfer(member.cookie, member.admin.id)).statusCode).toBe(403);
    expect((await transfer(owner.cookie, owner.admin.id)).statusCode).toBe(404);
    const stranger = await t.createAdmin("fremd@test.local", undefined, "Anderes Konto");
    expect((await transfer(owner.cookie, stranger.id)).statusCode).toBe(404);

    const done = await transfer(owner.cookie, member.admin.id);
    expect(done.statusCode).toBe(200);
    expect(done.json<AdminMe>()).toMatchObject({ id: owner.admin.id, role: "member" });

    const team = await app.inject({
      method: "GET",
      url: "/api/admin/team",
      headers: { cookie: owner.cookie },
    });
    expect(team.json().admins.map((a: { role: string }) => a.role)).toEqual(["member", "owner"]);
    // Die neue Inhaberin darf jetzt, die alte nicht mehr.
    expect((await transfer(owner.cookie, member.admin.id)).statusCode).toBe(403);
    expect((await transfer(member.cookie, owner.admin.id)).statusCode).toBe(200);
  });
});
