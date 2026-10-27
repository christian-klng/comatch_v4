import type { FastifyPluginAsync } from "fastify";

export interface HealthDeps {
  pingDb: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsync<HealthDeps> = async (app, { pingDb }) => {
  app.get("/health", async (_request, reply) => {
    let db: "ok" | "error" = "ok";
    try {
      await pingDb();
    } catch (err) {
      app.log.error({ err }, "Datenbank nicht erreichbar");
      db = "error";
    }
    return reply
      .code(db === "ok" ? 200 : 503)
      .send({ status: db === "ok" ? "ok" : "degraded", db, serverNow: Date.now() });
  });
};
