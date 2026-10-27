import { describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp();

describe("GET /api/health", () => {
  it("meldet ok, wenn die Datenbank antwortet", async () => {
    const res = await (await t.app()).inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: "ok" });
  });

  it("meldet 503, wenn die Datenbank fehlt", async () => {
    const app = await buildApp({
      db: t.db,
      publicBaseUrl: "http://x",
      cookieSecure: false,
      pingDb: async () => {
        throw new Error("down");
      },
    });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", db: "error" });
    await app.close();
  });
});
