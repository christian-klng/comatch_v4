import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.url(),
  PUBLIC_BASE_URL: z.url().default("http://localhost:5173"),
  /** Pfad zum gebauten Web-Frontend; wird in Produktion statisch ausgeliefert. */
  WEB_DIST_DIR: z.string().optional(),
  /** Session-Cookie nur über HTTPS senden. Standard: an in Produktion. */
  COOKIE_SECURE: z.stringbool().optional(),

  /** S3-kompatibler Bild-Speicher für Selfies (lokal RustFS, in Produktion Hetzner Object Storage). */
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default("fsn1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Schlüssel für signierte Bild-URLs. Ohne Angabe zufällig je Serverstart (alte URLs verfallen dann). */
  MEDIA_SIGNING_SECRET: z.string().min(32).optional(),
});

export type Config = z.infer<typeof envSchema> & { COOKIE_SECURE: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Ungültige Umgebungsvariablen:\n${z.prettifyError(result.error)}`);
  }
  return {
    ...result.data,
    COOKIE_SECURE: result.data.COOKIE_SECURE ?? result.data.NODE_ENV === "production",
  };
}
