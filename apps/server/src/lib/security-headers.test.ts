import { describe, expect, it } from "vitest";
import { useTestApp } from "../../test/helpers.ts";
import { securityHeaders } from "./security-headers.ts";

const t = useTestApp();

describe("securityHeaders", () => {
  it("erlaubt WebSockets zur eigenen Adresse und setzt HSTS nur bei HTTPS", () => {
    const https = securityHeaders("https://match.example.de");
    expect(https["content-security-policy"]).toContain("connect-src 'self' wss://match.example.de;");
    expect(https["strict-transport-security"]).toBe("max-age=31536000");

    const http = securityHeaders("http://localhost:5173");
    expect(http["content-security-policy"]).toContain("connect-src 'self' ws://localhost:5173;");
    expect(http["strict-transport-security"]).toBeUndefined();
  });

  it("stehen an allen Antworten, auch an Fehlern", async () => {
    const app = await t.app();
    for (const url of ["/api/health", "/api/gibt-es-nicht"]) {
      const res = await app.inject({ url });
      expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    }
  });
});
