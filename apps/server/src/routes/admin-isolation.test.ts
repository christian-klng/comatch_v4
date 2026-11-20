import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EventSummary, InviteCreated } from "@comatch/shared";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

/** Zwei Konten: A besitzt ein Event, B ist ein fremdes Konto. */
async function twoAccounts() {
  const event = await t.createEvent("open", "konto-a", "Konto A");
  const a = await t.loginAs("a@test.local", "Konto A");
  const b = await t.loginAs("b@test.local", "Konto B");
  return { app: await t.app(), event, a, b };
}

describe("Trennung der Konten", () => {
  it("behandelt ein fremdes Event auf jeder Admin-Route wie ein unbekanntes", async () => {
    const { app, event, a, b } = await twoAccounts();
    const fill = (url: string) =>
      url.replace(":id", event.id).replace(":participantId", randomUUID()).replace(":kind", "matches.csv");

    // Über die registrierten Routen, damit neue Routen nicht ungeprüft dazukommen.
    const routes = t.routes.filter((r) => r.url.startsWith("/api/admin/events/:id"));
    expect(routes.length).toBeGreaterThanOrEqual(15);

    for (const route of routes) {
      const res = await app.inject({
        method: route.method as "GET",
        url: fill(route.url),
        headers: { cookie: b.cookie },
      });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(404);
      if (route.method !== "HEAD") expect(res.json().error).toBe("event_not_found");
    }

    // Gegenprobe: Mit dem eigenen Konto sind dieselben Adressen erreichbar.
    for (const route of routes.filter((r) => r.method === "GET")) {
      const res = await app.inject({ method: "GET", url: fill(route.url), headers: { cookie: a.cookie } });
      expect(res.statusCode, `GET ${route.url}`).toBe(200);
    }
  });

  it("zeigt in der Liste nur die Events des eigenen Kontos", async () => {
    const { app, event, a, b } = await twoAccounts();
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/events",
      headers: { cookie: b.cookie },
      payload: { title: "Event von B", startsAt: null },
    });
    expect(created.statusCode).toBe(201);

    const list = async (cookie: string) =>
      (await app.inject({ method: "GET", url: "/api/admin/events", headers: { cookie } }))
        .json<EventSummary[]>()
        .map((e) => e.id);
    expect(await list(a.cookie)).toEqual([event.id]);
    expect(await list(b.cookie)).toEqual([created.json<EventSummary>().id]);
  });

  it("trennt Team und Einladungen", async () => {
    const { app, a, b } = await twoAccounts();
    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/invites",
      headers: { cookie: a.cookie },
      payload: { email: "neu@test.local" },
    });
    const invite = invited.json<InviteCreated>();

    const team = await app.inject({ method: "GET", url: "/api/admin/team", headers: { cookie: b.cookie } });
    expect(team.json().admins.map((x: { email: string }) => x.email)).toEqual(["b@test.local"]);
    expect(team.json().invites).toEqual([]);

    const dropInvite = await app.inject({
      method: "DELETE",
      url: `/api/admin/invites/${invite.id}`,
      headers: { cookie: b.cookie },
    });
    expect(dropInvite.statusCode).toBe(404);
    const dropAdmin = await app.inject({
      method: "DELETE",
      url: `/api/admin/admins/${a.admin.id}`,
      headers: { cookie: b.cookie },
    });
    expect(dropAdmin.statusCode).toBe(404);

    // Wer schon in einem Konto ist, lässt sich nicht in ein zweites einladen.
    const cross = await app.inject({
      method: "POST",
      url: "/api/admin/invites",
      headers: { cookie: b.cookie },
      payload: { email: "a@test.local" },
    });
    expect(cross.statusCode).toBe(409);

    // Die Einladung führt ins Konto der einladenden Person.
    const accepted = await app.inject({
      method: "POST",
      url: `/api/invites/${invite.acceptUrl.split("/invite/")[1]}/accept`,
      payload: { password: "ein-gutes-passwort" },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().accountId).toBe(a.admin.accountId);
  });
});
