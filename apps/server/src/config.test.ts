import { describe, expect, it } from "vitest";
import { legalInfo, loadConfig } from "./config.ts";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "b",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
};

describe("loadConfig", () => {
  it("behandelt leere optionale Werte wie nicht gesetzt (Docker Compose reicht sie leer durch)", () => {
    const config = loadConfig({ ...base, LEGAL_NAME: "", LEGAL_EMAIL: "", LEGAL_PHONE: " " });
    expect(legalInfo(config)).toMatchObject({ configured: false, name: null, email: null, phone: null });
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.RETENTION_HOURS).toBe(24);
  });

  it("gilt als konfiguriert mit Name, Adresse und E-Mail", () => {
    const config = loadConfig({
      ...base,
      LEGAL_NAME: "Beispiel GmbH",
      LEGAL_ADDRESS: "Weg 1, 12345 Ort",
      LEGAL_EMAIL: "info@example.de",
      TRUST_PROXY: "true",
      RETENTION_HOURS: "48",
    });
    expect(legalInfo(config)).toMatchObject({ configured: true, retentionHours: 48 });
    expect(config.TRUST_PROXY).toBe(true);
  });

  it("leitet das Secure-Cookie aus der Adresse ab und entfernt den Schrägstrich am Ende", () => {
    const https = loadConfig({
      ...base,
      NODE_ENV: "production",
      PUBLIC_BASE_URL: "https://match.example.de/",
    });
    expect(https.PUBLIC_BASE_URL).toBe("https://match.example.de");
    expect(https.COOKIE_SECURE).toBe(true);

    // Coolifys Test-Domain (sslip.io) läuft ohne HTTPS; sonst wäre keine Anmeldung möglich.
    const http = loadConfig({ ...base, NODE_ENV: "production", PUBLIC_BASE_URL: "http://1-2-3-4.sslip.io" });
    expect(http.COOKIE_SECURE).toBe(false);

    const forced = loadConfig({
      ...base,
      NODE_ENV: "production",
      PUBLIC_BASE_URL: "http://1-2-3-4.sslip.io",
      COOKIE_SECURE: "true",
    });
    expect(forced.COOKIE_SECURE).toBe(true);
  });

  it("lehnt eine ungültige E-Mail ab", () => {
    expect(() => loadConfig({ ...base, LEGAL_EMAIL: "keine-mail" })).toThrow(/LEGAL_EMAIL/);
  });
});
