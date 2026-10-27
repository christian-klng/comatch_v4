import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { IMAGE_MIME_TYPES, SELFIE_MAX_BYTES } from "@comatch/shared";
import type { AppContext } from "../context.ts";
import { participant } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { detectImageType } from "../lib/images.ts";
import { randomToken } from "../lib/tokens.ts";
import { getParticipantMe, selfiePrefix } from "../participants/service.ts";
import { requireParticipant } from "../participants/session.ts";

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** Endpunkte für das Handy einer teilnehmenden Person (Bearer-Token). */
export const participantRoutes: FastifyPluginAsync<AppContext> = async (app, { db, storage, media }) => {
  app.addHook("onRequest", requireParticipant(db));
  app.addContentTypeParser(
    [...IMAGE_MIME_TYPES],
    { parseAs: "buffer", bodyLimit: SELFIE_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.get("/", async (request) => getParticipantMe(db, media, request.participant!));

  /** Speichert ein (neues) Selfie. Mit dem ersten Selfie ist die Person bereit für Matches. */
  app.put("/selfie", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request) => {
    const me = request.participant!;
    const body = request.body;
    const mime = Buffer.isBuffer(body) && body.length > 0 ? detectImageType(body) : null;
    if (!mime)
      throw new HttpError(415, "unsupported_media_type", "Bitte ein Foto als JPEG, PNG oder WebP senden.");

    // Neuer Schlüssel je Upload: alte, signierte URLs zeigen nie auf ein anderes Bild.
    const key = `${selfiePrefix(me.eventId, me.id)}${randomToken(12)}.${EXTENSIONS[mime]}`;
    await storage.put(key, body as Buffer, mime);

    const firstSelfie = me.status === "onboarding";
    const [updated] = await db
      .update(participant)
      .set({
        selfieKey: key,
        ...(firstSelfie ? { status: "pool" as const, poolSince: new Date() } : {}),
      })
      .where(eq(participant.id, me.id))
      .returning();

    if (me.selfieKey) {
      await storage.delete(me.selfieKey).catch((err: unknown) => {
        request.log.warn({ err, key: me.selfieKey }, "Altes Selfie konnte nicht gelöscht werden");
      });
    }
    return getParticipantMe(db, media, updated!);
  });

  /** „Ich steige aus“: löscht Selfie, Antworten und die Person sofort. */
  app.delete("/", async (request, reply) => {
    const me = request.participant!;
    await db.delete(participant).where(eq(participant.id, me.id));
    await storage.deletePrefix(selfiePrefix(me.eventId, me.id));
    return reply.code(204).send();
  });
};
