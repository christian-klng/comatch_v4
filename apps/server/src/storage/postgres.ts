import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { mediaObject } from "../db/schema.ts";
import type { Storage } from "./storage.ts";

/**
 * Selfies in der eigenen Datenbank (Standard ohne S3). Bei bis zu 100 Personen mit je etwa
 * 100 KB sind das rund 10 MB pro Event, und die App liefert jedes Bild ohnehin selbst aus.
 */
export function createPostgresStorage(db: Db): Storage {
  return {
    async put(key, data, contentType) {
      await db
        .insert(mediaObject)
        .values({ key, data, contentType })
        .onConflictDoUpdate({ target: mediaObject.key, set: { data, contentType, createdAt: new Date() } });
    },

    async get(key) {
      const [row] = await db
        .select({ data: mediaObject.data, contentType: mediaObject.contentType })
        .from(mediaObject)
        .where(eq(mediaObject.key, key));
      return row ?? null;
    },

    async delete(key) {
      await db.delete(mediaObject).where(eq(mediaObject.key, key));
    },

    async deletePrefix(prefix) {
      // starts_with statt LIKE: Präfixe brauchen so kein Escaping von % und _.
      await db.delete(mediaObject).where(sql`starts_with(${mediaObject.key}, ${prefix})`);
    },
  };
}
