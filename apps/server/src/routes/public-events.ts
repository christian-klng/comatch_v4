import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../context.ts";
import { event } from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";

/** Öffentliche Event-Endpunkte (ohne Login). */
export const publicEventRoutes: FastifyPluginAsync<AppContext> = async (app, { db }) => {
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
