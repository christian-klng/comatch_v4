import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { signupInput, TERMS_VERSION, type AdminMe } from "@comatch/shared";
import { createSession, loadAdminMe, normalizeEmail, setSessionCookie } from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { account, adminUser, authToken } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { hashPassword } from "../lib/password.ts";
import { randomToken, sha256 } from "../lib/tokens.ts";
import { verifyEmailMail } from "../mail/templates.ts";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Erzeugt einen neuen Bestätigungslink und verschickt ihn. Auf den Versand selbst wird nicht
 * gewartet: Die Antwortzeit soll nicht davon abhängen, ob eine Mail rausgeht.
 */
export async function sendVerificationMail(
  { db, mailer, publicBaseUrl }: Pick<AppContext, "db" | "mailer" | "publicBaseUrl">,
  admin: { id: string; email: string },
  onError: (err: unknown) => void,
): Promise<void> {
  const token = randomToken();
  await db.insert(authToken).values({
    tokenHash: sha256(token),
    adminId: admin.id,
    kind: "verify_email",
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  mailer.send(verifyEmailMail(admin.email, { url: `${publicBaseUrl}/admin/verify/${token}` })).catch(onError);
}

/** Öffentliche Endpunkte: eigenes Konto anlegen und E-Mail bestätigen. */
export const signupRoutes: FastifyPluginAsync<AppContext> = async (app, context) => {
  const { db, cookieSecure, signupOpen } = context;

  /**
   * Legt ein Konto mit der Person als Inhaber*in an. Antwortet immer gleich, damit niemand
   * erfährt, welche E-Mails registriert sind; der Login geht erst nach der Bestätigung per Mail.
   */
  app.post(
    "/auth/signup",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      if (!signupOpen) {
        throw new HttpError(403, "signup_closed", "Neue Konten gibt es zurzeit nur auf Einladung.");
      }
      const input = signupInput.parse(request.body);
      const email = normalizeEmail(input.email);
      // Immer hashen, damit die Antwortzeit nicht verrät, ob es die E-Mail schon gibt.
      const passwordHash = await hashPassword(input.password);
      const logFailure = (err: unknown) => request.log.error({ err }, "Bestätigungsmail nicht verschickt");

      const existing = await db.query.adminUser.findFirst({
        where: eq(adminUser.email, email),
        columns: { id: true, email: true, emailVerifiedAt: true },
      });
      if (existing) {
        // Noch unbestätigt: Link erneut schicken. Bestätigte Konten bleiben unberührt.
        if (!existing.emailVerifiedAt) await sendVerificationMail(context, existing, logFailure);
        return reply.code(204).send();
      }

      const created = await db.transaction(async (tx) => {
        const [acc] = await tx
          .insert(account)
          .values({ name: input.accountName, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION })
          .returning({ id: account.id });
        const [admin] = await tx
          .insert(adminUser)
          .values({ accountId: acc!.id, email, passwordHash, role: "owner" })
          .returning({ id: adminUser.id, email: adminUser.email });
        return admin!;
      });
      await sendVerificationMail(context, created, logFailure);
      return reply.code(204).send();
    },
  );

  /** Bestätigt die E-Mail über den Link aus der Mail und meldet die Person an. */
  app.post<{ Params: { token: string } }>(
    "/auth/verify/:token",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const row = await db.query.authToken.findFirst({
        where: and(
          eq(authToken.tokenHash, sha256(request.params.token)),
          eq(authToken.kind, "verify_email"),
          isNull(authToken.usedAt),
          gt(authToken.expiresAt, new Date()),
        ),
      });
      if (!row) {
        throw new HttpError(
          404,
          "verify_invalid",
          "Der Link ist ungültig oder abgelaufen. Melde dich an, dann schicken wir dir einen neuen.",
        );
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.update(adminUser).set({ emailVerifiedAt: now }).where(eq(adminUser.id, row.adminId));
        await tx
          .update(authToken)
          .set({ usedAt: now })
          .where(and(eq(authToken.adminId, row.adminId), eq(authToken.kind, "verify_email")));
      });
      const session = await createSession(db, row.adminId);
      setSessionCookie(reply, session.token, session.expiresAt, cookieSecure);
      return (await loadAdminMe(db, row.adminId))! satisfies AdminMe;
    },
  );
};
