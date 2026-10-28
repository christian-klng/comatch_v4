import { monitorEventLoopDelay } from "node:perf_hooks";
import type { FastifyPluginAsync } from "fastify";

export interface HealthDeps {
  pingDb: () => Promise<void>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const healthRoutes: FastifyPluginAsync<HealthDeps> = async (app, { pingDb }) => {
  // Event-Loop-Verzögerung: zeigt, ob der Server mit der Arbeit nachkommt (Lasttest, Betrieb).
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  app.addHook("onClose", async () => loop.disable());

  // Docker prüft alle paar Sekunden: nur Warnungen loggen, sonst füllt das die Logs.
  app.get("/health", { logLevel: "warn" }, async (_request, reply) => {
    let db: "ok" | "error" = "ok";
    try {
      await pingDb();
    } catch (err) {
      app.log.error({ err }, "Datenbank nicht erreichbar");
      db = "error";
    }
    // Werte seit dem letzten Abruf (Nanosekunden → Millisekunden).
    const eventLoop = { p99Ms: round1(loop.percentile(99) / 1e6), maxMs: round1(loop.max / 1e6) };
    loop.reset();
    return reply.code(db === "ok" ? 200 : 503).send({
      status: db === "ok" ? "ok" : "degraded",
      db,
      serverNow: Date.now(),
      eventLoop,
      rssMb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
    });
  });
};
