import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { joinInput, type JoinResult } from "@comatch/shared";
import type { AppContext } from "../context.ts";
import { event } from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";
import { getParticipantMe, getPublicEvent, joinEvent } from "../participants/service.ts";

/** Öffentliche Event-Endpunkte (ohne Login). */
export const publicEventRoutes: FastifyPluginAsync<AppContext> = async (app, { db, media }) => {
  app.get<{ Params: { slug: string } }>("/events/:slug", async (request) =>
    getPublicEvent(db, request.params.slug),
  );

  app.post<{ Params: { slug: string } }>(
    "/events/:slug/join",
    // Je IP, aber großzügig: Im Event-WLAN stecken oft alle Handys hinter einer Adresse, und zum
    // Start treten viele gleichzeitig bei. Die Obergrenze je Event schützt zusätzlich.
    { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = joinInput.parse(request.body);
      const { token, participant } = await joinEvent(db, request.params.slug, input);
      const result: JoinResult = { token, participant: await getParticipantMe(db, media, participant) };
      return reply.code(201).send(result);
    },
  );

  app.get<{ Params: { slug: string } }>("/events/:slug/logo", async (request, reply) => {
    const row = await db.query.event.findFirst({
      where: eq(event.slug, request.params.slug),
      columns: { logoData: true, logoMime: true },
    });
    if (!row?.logoData || !row.logoMime) throw notFound("logo_not_found");
    // Die URL enthält einen Versions-Parameter, deshalb darf lange gecacht werden.
    return reply
      .header("Content-Type", row.logoMime)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff")
      .send(row.logoData);
  });
};
