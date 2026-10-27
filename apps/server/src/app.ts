import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import { healthRoutes, type HealthDeps } from "./routes/health.ts";

export interface AppOptions extends HealthDeps {
  logger?: FastifyServerOptions["logger"];
  /** Gebautes Web-Frontend; wenn gesetzt, liefert der Server es aus (Produktion). */
  webDistDir?: string;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(healthRoutes, { prefix: "/api", pingDb: options.pingDb });

  if (options.webDistDir && fs.existsSync(options.webDistDir)) {
    await app.register(fastifyStatic, { root: path.resolve(options.webDistDir) });
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
