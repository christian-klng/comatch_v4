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

  it("lehnt eine ungültige E-Mail ab", () => {
    expect(() => loadConfig({ ...base, LEGAL_EMAIL: "keine-mail" })).toThrow(/LEGAL_EMAIL/);
  });
});
