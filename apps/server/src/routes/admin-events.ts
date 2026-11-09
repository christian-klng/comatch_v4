import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  LOGO_MAX_BYTES,
  IMAGE_MIME_TYPES,
  eventCreateInput,
  eventControlInput,
  eventGeneralInput,
  defaultQuestions,
  questionsInput,
} from "@comatch/shared";
import type { AppContext } from "../context.ts";
import { event, participant } from "../db/schema.ts";
import { eventStats, listParticipants, matchesCsv, participantsCsv } from "../events/report.ts";
import { purgeEvent } from "../events/retention.ts";
import { createEvent, getEventDetail, listEvents, replaceQuestions } from "../events/service.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { detectImageType } from "../lib/images.ts";
import { randomToken } from "../lib/tokens.ts";
import { selfiePrefix } from "../participants/service.ts";

const idParams = z.object({ id: z.uuid() });
const participantParams = z.object({ id: z.uuid(), participantId: z.uuid() });
/** Vorerst nur Entwurf ↔ Offen; Start, Pause und Ende kommen mit der Live-Steuerung. */
const statusInput = z.object({ status: z.enum(["draft", "open"]) });

/** Event-Verwaltung. Läuft im geschützten /admin-Bereich. */
export const adminEventRoutes: FastifyPluginAsync<AppContext> = async (
  app,
  { db, storage, media, live, publicBaseUrl, retentionMs },
) => {
  // Logos kommen als rohe Bilddaten (kein Multipart), begrenzt auf LOGO_MAX_BYTES.
  app.addContentTypeParser(
    [...IMAGE_MIME_TYPES],
    { parseAs: "buffer", bodyLimit: LOGO_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  const detail = (id: string) => getEventDetail(db, id, publicBaseUrl, retentionMs);

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
    const id = await createEvent(db, input, request.admin!.id, defaultQuestions(input.language));
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
        // Wirkt bei Teilnehmenden und auf der Leinwand beim nächsten Laden der Seite.
        language: input.language,
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

  app.put("/events/:id/status", async (request) => {
    const { id } = idParams.parse(request.params);
    const { status } = statusInput.parse(request.body);
    const row = await requireEvent(id);
    if (row.status === status) return detail(id);
    if (row.status !== "draft" && row.status !== "open") {
      throw new HttpError(409, "status_change_unsupported", "Dieser Statuswechsel ist noch nicht möglich.");
    }
    if (status === "draft" && (await db.$count(participant, eq(participant.eventId, id))) > 0) {
      throw new HttpError(
        409,
        "has_participants",
        "Es sind schon Personen beigetreten. Das Event kann nicht zurück in den Entwurf.",
      );
    }
    await db.update(event).set({ status }).where(eq(event.id, id));
    return detail(id);
  });

  // -------------------------------------------------------------------------
  // Teilnehmende, Statistik und Export
  // -------------------------------------------------------------------------

  app.get("/events/:id/participants", async (request) => {
    const { id } = idParams.parse(request.params);
    await requireEvent(id);
    return listParticipants(db, media, id, (p) => live.isPresent(p));
  });

  /** Eingriff bei unpassendem Selfie: zurücksetzen (neu fotografieren) oder Person entfernen. */
  const moderate = (action: "reset_selfie" | "remove") => async (request: { params: unknown }) => {
    const { id, participantId } = participantParams.parse(request.params);
    await requireEvent(id);
    const { selfieKey } = await live.moderate(id, participantId, action);
    if (selfieKey) await storage.deletePrefix(selfiePrefix(id, participantId));
    return listParticipants(db, media, id, (p) => live.isPresent(p));
  };
  app.post("/events/:id/participants/:participantId/reset-selfie", moderate("reset_selfie"));
  app.delete("/events/:id/participants/:participantId", moderate("remove"));

  app.get("/events/:id/stats", async (request) => {
    const { id } = idParams.parse(request.params);
    await requireEvent(id);
    return eventStats(db, id);
  });

  const exports = { matches: matchesCsv, participants: participantsCsv };
  app.get("/events/:id/export/:kind", async (request, reply) => {
    const { id, kind } = idParams
      .extend({ kind: z.enum(["matches.csv", "participants.csv"]) })
      .parse(request.params);
    const row = await db.query.event.findFirst({ where: eq(event.id, id), columns: { slug: true } });
    if (!row) throw notFound("event_not_found");
    const name = kind.replace(".csv", "") as keyof typeof exports;
    const filename = `comatch-${row.slug}-${name === "matches" ? "matches" : "teilnehmende"}.csv`;
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .header("cache-control", "no-store")
      .send(await exports[name](db, id));
  });

  /** Selfies und Sitzungen sofort löschen statt nach Ablauf der Frist (nur beendete Events). */
  app.post("/events/:id/purge", async (request) => {
    const { id } = idParams.parse(request.params);
    const row = await requireEvent(id);
    if (row.status !== "ended") {
      throw new HttpError(409, "event_not_ended", "Fotos lassen sich erst nach dem Ende des Events löschen.");
    }
    await purgeEvent(db, storage, id, new Date());
    return detail(id);
  });

  /** Live-Steuerung: Start, Pause, Fortsetzen, nächste Runde, Verlängern, Ende. */
  app.post("/events/:id/control", async (request) => {
    const { id } = idParams.parse(request.params);
    const { action } = eventControlInput.parse(request.body);
    await live.control(id, action);
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
    live.forget(id);
    await db.delete(event).where(eq(event.id, id));
    await storage.deletePrefix(`events/${id}/`);
    return reply.code(204).send();
  });
};
