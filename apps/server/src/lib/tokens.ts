import { createHash, randomBytes } from "node:crypto";

/** Zufälliges, URL-taugliches Token (Standard: 256 Bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Ohne leicht verwechselbare Zeichen (0/o, 1/l/i), weil der Code auch abgetippt wird.
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomSlug(length = 6): string {
  const bytes = randomBytes(length);
  let slug = "";
  for (const byte of bytes) slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  return slug;
}
