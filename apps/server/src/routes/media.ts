import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.ts";
import { HttpError, notFound } from "../lib/errors.ts";

const query = z.object({ exp: z.coerce.number(), sig: z.string().min(1) });

/** Liefert Bilder aus dem Speicher aus, aber nur mit gültiger, nicht abgelaufener Signatur. */
export const mediaRoutes: FastifyPluginAsync<AppContext> = async (app, { storage, media }) => {
  app.get<{ Params: { "*": string } }>("/media/*", async (request, reply) => {
    const key = request.params["*"];
    const parsed = query.safeParse(request.query);
    if (!parsed.success || !media.verify(key, parsed.data.exp, parsed.data.sig)) {
      throw new HttpError(403, "invalid_signature", "Dieser Link ist abgelaufen.");
    }
    const object = await storage.get(key);
    if (!object) throw notFound("media_not_found");

    const maxAge = Math.max(0, Math.floor((parsed.data.exp - Date.now()) / 1000));
    return reply
      .header("Content-Type", object.contentType)
      .header("Cache-Control", `private, max-age=${maxAge}`)
      .header("X-Content-Type-Options", "nosniff")
      .send(object.data);
  });
};
