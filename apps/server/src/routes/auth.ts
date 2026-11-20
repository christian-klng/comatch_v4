import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AdminMe } from "@comatch/shared";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  loadAdminMe,
  normalizeEmail,
  requireAdmin,
  setSessionCookie,
} from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { adminUser } from "../db/schema.ts";
import { sendVerificationMail } from "./signup.ts";
import { HttpError } from "../lib/errors.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";

const loginBody = z.object({ email: z.string().min(1), password: z.string().min(1) });

// Vergleichshash für unbekannte E-Mails, damit die Antwortzeit nichts verrät.
const dummyHash = hashPassword("dummy-password-for-timing");

export const authRoutes: FastifyPluginAsync<AppContext> = async (app, context) => {
  const { db, cookieSecure } = context;
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = loginBody.parse(request.body);
      const admin = await db.query.adminUser.findFirst({
        where: eq(adminUser.email, normalizeEmail(body.email)),
      });
      const valid = await verifyPassword(body.password, admin?.passwordHash ?? (await dummyHash));
      if (!admin || !valid)
        throw new HttpError(401, "invalid_credentials", "E-Mail oder Passwort ist falsch.");

      if (!admin.emailVerifiedAt) {
        // Das Passwort stimmt: Die Person bekommt den Link noch einmal.
        await sendVerificationMail(context, admin, (err) =>
          request.log.error({ err }, "Bestätigungsmail nicht verschickt"),
        );
        throw new HttpError(
          403,
          "email_unverified",
          "Bitte bestätige zuerst deine E-Mail. Wir haben dir den Link gerade noch einmal geschickt.",
        );
      }

      const session = await createSession(db, admin.id);
      setSessionCookie(reply, session.token, session.expiresAt, cookieSecure);
      return (await loadAdminMe(db, admin.id))! satisfies AdminMe;
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/auth/me", { onRequest: requireAdmin(db) }, async (request) => request.admin as AdminMe);
};
