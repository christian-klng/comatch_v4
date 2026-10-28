import { eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { confirmCodeInput, IMAGE_MIME_TYPES, matchActionInput, SELFIE_MAX_BYTES } from "@comatch/shared";
import type { AppContext } from "../context.ts";
import { participant } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { detectImageType } from "../lib/images.ts";
import { randomToken } from "../lib/tokens.ts";
import { getParticipantMe, selfiePrefix } from "../participants/service.ts";
import { requireParticipant } from "../participants/session.ts";

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/**
 * Begrenzung je Person statt je IP: Im Event-WLAN teilen sich oft alle Handys eine öffentliche
 * Adresse. Läuft nach dem Laden der Person (preHandler).
 */
const perParticipant = (max: number) => ({
  rateLimit: {
    max,
    timeWindow: "1 minute",
    hook: "preHandler" as const,
    keyGenerator: (request: FastifyRequest) => request.participant?.id ?? request.ip,
  },
});

/** Endpunkte für das Handy einer teilnehmenden Person (Bearer-Token). */
export const participantRoutes: FastifyPluginAsync<AppContext> = async (
  app,
  { db, storage, media, live },
) => {
  app.addHook("onRequest", requireParticipant(db));
  app.addContentTypeParser(
    [...IMAGE_MIME_TYPES],
    { parseAs: "buffer", bodyLimit: SELFIE_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.get("/", async (request) => getParticipantMe(db, media, request.participant!));

  /** Speichert ein (neues) Selfie. Mit dem ersten Selfie ist die Person bereit für Matches. */
  app.put("/selfie", { config: perParticipant(10) }, async (request) => {
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
    // Neues Selfie: Gegenüber und Leinwand sehen es sofort; beim ersten Selfie startet die Suche.
    await live.participantChanged(me.eventId);
    return getParticipantMe(db, media, updated!);
  });

  /** Code des Gegenübers gewählt. Falsche Codes sperren kurz; das regelt die Live-Laufzeit. */
  app.post("/match/confirm", { config: perParticipant(30) }, async (request) => {
    const me = request.participant!;
    const input = confirmCodeInput.parse(request.body);
    return live.confirmCode(me.eventId, { participantId: me.id, ...input });
  });

  /** „Nicht gefunden“: neues Match suchen (ab Rundenmitte). */
  app.post("/match/not-found", { config: perParticipant(10) }, async (request) => {
    const me = request.participant!;
    const { matchId } = matchActionInput.parse(request.body);
    return live.giveUp(me.eventId, { participantId: me.id, matchId });
  });

  /** „Ich steige aus“: löscht Selfie, Antworten und die Person sofort. */
  app.delete("/", async (request, reply) => {
    const me = request.participant!;
    await db.delete(participant).where(eq(participant.id, me.id));
    await storage.deletePrefix(selfiePrefix(me.eventId, me.id));
    live.invalidate(me.id);
    await live.participantChanged(me.eventId);
    return reply.code(204).send();
  });
};
