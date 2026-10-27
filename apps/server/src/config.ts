import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.url(),
  PUBLIC_BASE_URL: z.url().default("http://localhost:5173"),
  /** Pfad zum gebauten Web-Frontend; wird in Produktion statisch ausgeliefert. */
  WEB_DIST_DIR: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Ungültige Umgebungsvariablen:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
