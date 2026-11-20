import type { LegalInfo } from "@comatch/shared";
import type { Db } from "./db/client.ts";
import type { MediaSigner } from "./lib/media.ts";
import type { Mailer } from "./mail/mailer.ts";
import type { LiveEvents } from "./live/runtime.ts";
import type { Storage } from "./storage/storage.ts";

/** Abhängigkeiten, die alle Routen-Plugins bekommen. */
export interface AppContext {
  db: Db;
  storage: Storage;
  media: MediaSigner;
  live: LiveEvents;
  mailer: Mailer;
  publicBaseUrl: string;
  cookieSecure: boolean;
  /** Löschfrist nach Eventende. */
  retentionMs: number;
  legal: LegalInfo;
  /** Dürfen sich neue Konten selbst registrieren (SIGNUP_MODE=open)? */
  signupOpen: boolean;
}
