import { describe, expect, it } from "vitest";
import { legalInfo, loadConfig, s3Options } from "./config.ts";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

describe("loadConfig", () => {
  it("legt Selfies ohne S3_ENDPOINT in die Datenbank, auch bei leeren S3-Werten", () => {
    expect(s3Options(loadConfig(base))).toBeNull();
    expect(s3Options(loadConfig({ ...base, S3_ENDPOINT: "", S3_BUCKET: "", S3_REGION: "" }))).toBeNull();
  });

  it("nutzt S3, wenn der Endpunkt gesetzt ist, und verlangt dann Bucket und Schlüssel", () => {
    const s3 = { S3_ENDPOINT: "http://localhost:9000", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k" };
    expect(() => loadConfig({ ...base, ...s3 })).toThrow(/S3_SECRET_ACCESS_KEY/);
    expect(s3Options(loadConfig({ ...base, ...s3, S3_SECRET_ACCESS_KEY: "s" }))).toEqual({
      endpoint: "http://localhost:9000",
      region: "fsn1",
      bucket: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
    });
  });

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
