import type { Db } from "./db/client.ts";

/** Abhängigkeiten, die alle Routen-Plugins bekommen. */
export interface AppContext {
  db: Db;
  publicBaseUrl: string;
  cookieSecure: boolean;
}
