import type { Db } from "./db/client.ts";
import type { MediaSigner } from "./lib/media.ts";
import type { LiveEvents } from "./live/runtime.ts";
import type { Storage } from "./storage/storage.ts";

/** Abhängigkeiten, die alle Routen-Plugins bekommen. */
export interface AppContext {
  db: Db;
  storage: Storage;
  media: MediaSigner;
  live: LiveEvents;
  publicBaseUrl: string;
  cookieSecure: boolean;
}
