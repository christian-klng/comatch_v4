import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 60 * 60 * 1000;
// Ablaufzeit auf 10 Minuten gerundet, damit dieselbe URL eine Weile gleich bleibt und gecacht werden kann.
const BUCKET_MS = 10 * 60 * 1000;

/** Erzeugt und prüft kurzlebige, signierte URLs für Dateien im Bild-Speicher. */
export interface MediaSigner {
  url(key: string, now?: number): string;
  verify(key: string, exp: number, sig: string, now?: number): boolean;
}

export function createMediaSigner(secret: string): MediaSigner {
  const sign = (key: string, exp: number) =>
    createHmac("sha256", secret).update(`${key}\n${exp}`).digest("base64url");

  return {
    url(key, now = Date.now()) {
      const exp = Math.ceil((now + TTL_MS) / BUCKET_MS) * BUCKET_MS;
      return `/api/media/${key}?exp=${exp}&sig=${sign(key, exp)}`;
    },
    verify(key, exp, sig, now = Date.now()) {
      if (!Number.isFinite(exp) || exp < now) return false;
      const expected = Buffer.from(sign(key, exp));
      const given = Buffer.from(sig);
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
  };
}
