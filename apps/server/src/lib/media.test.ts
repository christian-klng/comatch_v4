import { describe, expect, it } from "vitest";
import { createMediaSigner } from "./media.ts";

const signer = createMediaSigner("geheim-geheim-geheim-geheim-geheim");
const NOW = Date.UTC(2026, 10, 20, 18, 3);

function parse(url: string) {
  const u = new URL(url, "http://x");
  return {
    key: u.pathname.replace("/api/media/", ""),
    exp: Number(u.searchParams.get("exp")),
    sig: u.searchParams.get("sig")!,
  };
}

describe("createMediaSigner", () => {
  it("signiert URLs, die etwa eine Stunde gültig sind", () => {
    const { key, exp, sig } = parse(signer.url("events/e/selfies/p/a.jpg", NOW));
    expect(key).toBe("events/e/selfies/p/a.jpg");
    expect(exp - NOW).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(exp - NOW).toBeLessThan(70 * 60 * 1000);
    expect(signer.verify(key, exp, sig, NOW)).toBe(true);
    expect(signer.verify(key, exp, sig, exp + 1)).toBe(false);
  });

  it("liefert innerhalb von 10 Minuten dieselbe URL (cachefreundlich)", () => {
    expect(signer.url("k", NOW)).toBe(signer.url("k", NOW + 60_000));
  });

  it("erkennt andere Schlüssel, Ablaufzeiten und fremde Geheimnisse", () => {
    const { key, exp, sig } = parse(signer.url("k", NOW));
    expect(signer.verify("k2", exp, sig, NOW)).toBe(false);
    expect(signer.verify(key, exp + 600_000, sig, NOW)).toBe(false);
    expect(createMediaSigner("anderes-geheimnis-anderes-geheimnis").verify(key, exp, sig, NOW)).toBe(false);
  });
});
