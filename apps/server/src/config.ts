import { z } from "zod";
import type { LegalInfo } from "@comatch/shared";
import type { S3Options } from "./storage/s3.ts";

/** Leere Werte (z. B. `LEGAL_PHONE=` aus Docker Compose) gelten als nicht gesetzt. */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.url(),
  PUBLIC_BASE_URL: z.url().default("http://localhost:5173"),
  /** Pfad zum gebauten Web-Frontend; wird in Produktion statisch ausgeliefert. */
  WEB_DIST_DIR: z.string().optional(),
  /** Session-Cookie nur über HTTPS senden. Standard: an in Produktion, wenn die App unter HTTPS läuft. */
  COOKIE_SECURE: z.stringbool().optional(),

  /**
   * Optional: S3-kompatibler Bild-Speicher für Selfies (z. B. Hetzner Object Storage).
   * Ohne S3_ENDPOINT liegen die Selfies in der Datenbank.
   */
  S3_ENDPOINT: optionalText(z.url()),
  S3_REGION: optionalText(z.string()),
  S3_BUCKET: optionalText(z.string()),
  S3_ACCESS_KEY_ID: optionalText(z.string()),
  S3_SECRET_ACCESS_KEY: optionalText(z.string()),
  /** Schlüssel für signierte Bild-URLs. Ohne Angabe zufällig je Serverstart (alte URLs verfallen dann). */
  MEDIA_SIGNING_SECRET: z.string().min(32).optional(),

  /** Stunden nach Eventende, nach denen Selfies und Sitzungen automatisch gelöscht werden. */
  RETENTION_HOURS: z.coerce.number().positive().default(24),
  /** Nur hinter einem Reverse-Proxy (Caddy) einschalten: Dann gilt X-Forwarded-For als Client-IP. */
  TRUST_PROXY: z.stringbool().default(false),

  /** Angaben für Impressum und Datenschutzerklärung (Pflicht im Produktivbetrieb). */
  LEGAL_NAME: optionalText(z.string()),
  LEGAL_ADDRESS: optionalText(z.string()),
  LEGAL_EMAIL: optionalText(z.email()),
  LEGAL_PHONE: optionalText(z.string()),
  /** Optional: Datenschutzbeauftragte*r (Name und Kontakt). */
  LEGAL_DPO: optionalText(z.string()),
});

export type Config = z.infer<typeof envSchema> & { COOKIE_SECURE: boolean };

/** Angaben für Impressum und Datenschutzerklärung, wie sie das Frontend bekommt. */
export function legalInfo(config: Config): LegalInfo {
  return {
    configured: Boolean(config.LEGAL_NAME && config.LEGAL_ADDRESS && config.LEGAL_EMAIL),
    name: config.LEGAL_NAME ?? null,
    address: config.LEGAL_ADDRESS ?? null,
    email: config.LEGAL_EMAIL ?? null,
    phone: config.LEGAL_PHONE ?? null,
    dpo: config.LEGAL_DPO ?? null,
    retentionHours: config.RETENTION_HOURS,
  };
}

/** Zugangsdaten für S3, oder null, wenn die Selfies in der Datenbank liegen. */
export function s3Options(config: Config): S3Options | null {
  if (!config.S3_ENDPOINT) return null;
  return {
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION ?? "fsn1",
    bucket: config.S3_BUCKET!,
    accessKeyId: config.S3_ACCESS_KEY_ID!,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema
    .refine((c) => !c.S3_ENDPOINT || (c.S3_BUCKET && c.S3_ACCESS_KEY_ID && c.S3_SECRET_ACCESS_KEY), {
      message: "Mit S3_ENDPOINT sind auch S3_BUCKET, S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY nötig.",
      path: ["S3_ENDPOINT"],
    })
    .safeParse(env);
  if (!result.success) {
    throw new Error(`Ungültige Umgebungsvariablen:\n${z.prettifyError(result.error)}`);
  }
  return {
    ...result.data,
    // Ohne Schrägstrich am Ende, sonst entstehen Links wie https://domain//e/abc.
    PUBLIC_BASE_URL: result.data.PUBLIC_BASE_URL.replace(/\/+$/, ""),
    COOKIE_SECURE:
      result.data.COOKIE_SECURE ??
      (result.data.NODE_ENV === "production" && result.data.PUBLIC_BASE_URL.startsWith("https://")),
  };
}
