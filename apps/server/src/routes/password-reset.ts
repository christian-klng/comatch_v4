import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AdminMe } from "@comatch/shared";
import { createSession, loadAdminMe, normalizeEmail, setSessionCookie } from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { adminSession, adminUser, authToken } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { hashPassword } from "../lib/password.ts";
import { randomToken, sha256 } from "../lib/tokens.ts";
import { MIN_PASSWORD_LENGTH } from "./invites.ts";
import { passwordResetMail } from "../mail/templates.ts";

export const RESET_TTL_MS = 60 * 60 * 1000;

const forgotBody = z.object({ email: z.string().min(1).max(320) });
const resetBody = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`).max(200),
});

/** Öffentliche Endpunkte für „Passwort vergessen“. */
export const passwordResetRoutes: FastifyPluginAsync<AppContext> = async (
  app,
  { db, mailer, publicBaseUrl, cookieSecure },
) => {
  const rateLimit = { max: 5, timeWindow: "15 minutes" };

  const findOpenToken = async (token: string) => {
    const row = await db.query.authToken.findFirst({
      where: and(
        eq(authToken.tokenHash, sha256(token)),
        eq(authToken.kind, "reset_password"),
        isNull(authToken.usedAt),
        gt(authToken.expiresAt, new Date()),
      ),
    });
    if (!row) throw new HttpError(404, "reset_invalid", "Der Link ist ungültig oder abgelaufen.");
    return row;
  };

  /** Antwortet immer gleich, damit niemand erfährt, welche E-Mails registriert sind. */
  app.post("/auth/forgot", { config: { rateLimit } }, async (request, reply) => {
    const email = normalizeEmail(forgotBody.parse(request.body).email);
    const admin = await db.query.adminUser.findFirst({
      where: eq(adminUser.email, email),
      columns: { id: true, email: true },
    });
    if (admin) {
      const token = randomToken();
      await db.insert(authToken).values({
        tokenHash: sha256(token),
        adminId: admin.id,
        kind: "reset_password",
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
      // Nicht auf den Versand warten: Die Antwortzeit soll nichts über die E-Mail verraten.
      mailer
        .send(passwordResetMail(admin.email, { url: `${publicBaseUrl}/admin/reset/${token}` }))
        .catch((err: unknown) => request.log.error({ err }, "Mail zum Zurücksetzen nicht verschickt"));
    }
    return reply.code(204).send();
  });

  /** Prüft den Link, bevor das Formular erscheint. */
  app.get<{ Params: { token: string } }>("/auth/reset/:token", async (request, reply) => {
    await findOpenToken(request.params.token);
    return reply.code(204).send();
  });

  app.post<{ Params: { token: string } }>(
    "/auth/reset/:token",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const { password } = resetBody.parse(request.body);
      const row = await findOpenToken(request.params.token);
      const passwordHash = await hashPassword(password);
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.update(adminUser).set({ passwordHash }).where(eq(adminUser.id, row.adminId));
        // Alle offenen Links der Person verfallen, und wer angemeldet war, fliegt raus.
        await tx
          .update(authToken)
          .set({ usedAt: now })
          .where(
            and(
              eq(authToken.adminId, row.adminId),
              eq(authToken.kind, "reset_password"),
              isNull(authToken.usedAt),
            ),
          );
        await tx.delete(adminSession).where(eq(adminSession.adminId, row.adminId));
      });

      const session = await createSession(db, row.adminId);
      setSessionCookie(reply, session.token, session.expiresAt, cookieSecure);
      return (await loadAdminMe(db, row.adminId))! satisfies AdminMe;
    },
  );
};
