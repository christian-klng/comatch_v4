import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  DEFAULT_QUESTIONS,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  eventCreateInput,
  eventGeneralInput,
  questionsInput,
} from "@comatch/shared";
import type { AppContext } from "../context.ts";
import { event } from "../db/schema.ts";
import { createEvent, getEventDetail, listEvents, replaceQuestions } from "../events/service.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { detectImageType } from "../lib/images.ts";
import { randomToken } from "../lib/tokens.ts";

const idParams = z.object({ id: z.uuid() });

/** Event-Verwaltung. Läuft im geschützten /admin-Bereich. */
export const adminEventRoutes: FastifyPluginAsync<AppContext> = async (app, { db, publicBaseUrl }) => {
  // Logos kommen als rohe Bilddaten (kein Multipart), begrenzt auf LOGO_MAX_BYTES.
  app.addContentTypeParser(
    [...LOGO_MIME_TYPES],
    { parseAs: "buffer", bodyLimit: LOGO_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  const detail = (id: string) => getEventDetail(db, id, publicBaseUrl);

  const requireEvent = async (id: string) => {
    const row = await db.query.event.findFirst({
      where: eq(event.id, id),
      columns: { id: true, status: true },
    });
    if (!row) throw notFound("event_not_found");
    return row;
  };

  app.get("/events", async () => listEvents(db));

  app.post("/events", async (request, reply) => {
    const input = eventCreateInput.parse(request.body);
    const id = await createEvent(db, input, request.admin!.id, DEFAULT_QUESTIONS);
    return reply.code(201).send(await detail(id));
  });

  app.get("/events/:id", async (request) => detail(idParams.parse(request.params).id));

  app.put("/events/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const input = eventGeneralInput.parse(request.body);
    await requireEvent(id);
    await db
      .update(event)
      .set({
        title: input.title,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        roundDurationS: input.roundDurationS,
        firstMatchDelayS: input.firstMatchDelayS,
        primaryColor: input.primaryColor,
      })
      .where(eq(event.id, id));
    return detail(id);
  });

  app.put("/events/:id/questions", async (request) => {
    const { id } = idParams.parse(request.params);
    const questions = questionsInput.parse(request.body);
    await requireEvent(id);
    await db.transaction((tx) => replaceQuestions(tx, id, questions));
    return detail(id);
  });

  app.put("/events/:id/logo", async (request) => {
    const { id } = idParams.parse(request.params);
    await requireEvent(id);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new HttpError(415, "unsupported_media_type", "Bitte ein PNG-, JPEG- oder WebP-Bild hochladen.");
    }
    const mime = detectImageType(request.body);
    if (!mime)
      throw new HttpError(415, "unsupported_media_type", "Bitte ein PNG-, JPEG- oder WebP-Bild hochladen.");
    await db
      .update(event)
      .set({ logoData: request.body, logoMime: mime, logoUpdatedAt: new Date() })
      .where(eq(event.id, id));
    return detail(id);
  });

  app.delete("/events/:id/logo", async (request) => {
    const { id } = idParams.parse(request.params);
    await requireEvent(id);
    await db
      .update(event)
      .set({ logoData: null, logoMime: null, logoUpdatedAt: null })
      .where(eq(event.id, id));
    return detail(id);
  });

  /** Erzeugt einen neuen Präsentationslink; der alte funktioniert danach nicht mehr. */
  app.post("/events/:id/presenter-token", async (request) => {
    const { id } = idParams.parse(request.params);
    await requireEvent(id);
    await db
      .update(event)
      .set({ presenterToken: randomToken(24) })
      .where(eq(event.id, id));
    return detail(id);
  });

  app.delete("/events/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const row = await requireEvent(id);
    if (row.status === "running" || row.status === "paused") {
      throw new HttpError(
        409,
        "event_live",
        "Ein laufendes Event kann nicht gelöscht werden. Bitte zuerst beenden.",
      );
    }
    await db.delete(event).where(eq(event.id, id));
    return reply.code(204).send();
  });
};
