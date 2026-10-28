import fs from "node:fs";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyServerOptions } from "fastify";
import { requireAdmin } from "./auth/session.ts";
import type { AppContext } from "./context.ts";
import { errorHandler, HttpError } from "./lib/errors.ts";
import { adminEventRoutes } from "./routes/admin-events.ts";
import { adminTeamRoutes } from "./routes/admin-team.ts";
import { authRoutes } from "./routes/auth.ts";
import { healthRoutes } from "./routes/health.ts";
import { inviteRoutes } from "./routes/invites.ts";
import { mediaRoutes } from "./routes/media.ts";
import { participantRoutes } from "./routes/participant.ts";
import { presentRoutes } from "./routes/present.ts";
import { publicEventRoutes } from "./routes/public-events.ts";

export interface AppOptions extends AppContext {
  logger?: FastifyServerOptions["logger"];
  /** Gebautes Web-Frontend; wenn gesetzt, liefert der Server es aus (Produktion). */
  webDistDir?: string;
  /** Überschreibt den DB-Check des Health-Endpunkts (für Tests). */
  pingDb?: () => Promise<void>;
}

export async function buildApp(options: AppOptions) {
  const { logger, webDistDir, pingDb, ...context } = options;
  const app = Fastify({ logger: logger ?? false, trustProxy: true });

  app.decorateRequest("admin", null);
  app.decorateRequest("participant", null);
  app.setErrorHandler(errorHandler);
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new HttpError(
        429,
        "rate_limited",
        `Zu viele Anfragen. Bitte in ${Math.max(1, Math.ceil(context.ttl / 1000))} s erneut versuchen.`,
      ),
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes, {
        pingDb:
          pingDb ??
          (async () => {
            await context.db.execute(sql`select 1`);
          }),
      });
      await api.register(authRoutes, context);
      await api.register(inviteRoutes, context);
      await api.register(publicEventRoutes, context);
      await api.register(mediaRoutes, context);
      await api.register(presentRoutes, context);
      await api.register(participantRoutes, { ...context, prefix: "/participant" });

      await api.register(
        async (admin) => {
          admin.addHook("onRequest", requireAdmin(context.db));
          await admin.register(adminEventRoutes, context);
          await admin.register(adminTeamRoutes, context);
        },
        { prefix: "/admin" },
      );
    },
    { prefix: "/api" },
  );

  if (webDistDir && fs.existsSync(webDistDir)) {
    await app.register(fastifyStatic, { root: path.resolve(webDistDir) });
    // Single-Page-App: alle unbekannten Nicht-API-Pfade liefern index.html aus.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api") || request.method !== "GET") {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
