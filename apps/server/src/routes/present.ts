import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { PresenterEvent } from "@comatch/shared";
import type { AppContext } from "../context.ts";
import { event } from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";

const params = z.object({ eventId: z.uuid() });
const query = z.object({ token: z.string().min(1) });

/** Leinwand: Titel, Branding und Beitrittslink. Nur mit dem Presenter-Token aus dem Link. */
export const presentRoutes: FastifyPluginAsync<AppContext> = async (app, { db, publicBaseUrl }) => {
  app.get("/present/:eventId", async (request): Promise<PresenterEvent> => {
    const { eventId } = params.parse(request.params);
    const { token } = query.parse(request.query);
    const row = await db.query.event.findFirst({
      where: eq(event.id, eventId),
      columns: {
        id: true,
        slug: true,
        title: true,
        language: true,
        primaryColor: true,
        logoUpdatedAt: true,
        presenterToken: true,
      },
    });
    // Falscher Token und unbekanntes Event sehen gleich aus.
    if (!row || row.presenterToken !== token) throw notFound("event_not_found");
    return {
      id: row.id,
      title: row.title,
      language: row.language,
      joinUrl: `${publicBaseUrl}/e/${row.slug}`,
      logoUrl: row.logoUpdatedAt ? `/api/events/${row.slug}/logo?v=${row.logoUpdatedAt.getTime()}` : null,
      primaryColor: row.primaryColor,
    };
  });
};
