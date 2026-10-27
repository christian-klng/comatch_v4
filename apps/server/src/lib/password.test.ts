import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

describe("password", () => {
  it("verifiziert das richtige Passwort", async () => {
    const hash = await hashPassword("geheim-123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("geheim-123", hash)).toBe(true);
  });

  it("lehnt falsche Passwörter und kaputte Hashes ab", async () => {
    const hash = await hashPassword("geheim-123");
    expect(await verifyPassword("falsch", hash)).toBe(false);
    expect(await verifyPassword("geheim-123", "kaputt")).toBe(false);
  });
});
