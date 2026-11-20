import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH, type AdminMe, type InvitePreview } from "@comatch/shared";
import { createSession, loadAdminMe, setSessionCookie } from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { adminInvite, adminUser } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { hashPassword } from "../lib/password.ts";
import { sha256 } from "../lib/tokens.ts";

const acceptBody = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`).max(200),
});

/** Öffentliche Endpunkte zum Annehmen einer Admin-Einladung. */
export const inviteRoutes: FastifyPluginAsync<AppContext> = async (app, { db, cookieSecure }) => {
  const findOpenInvite = async (token: string) => {
    const invite = await db.query.adminInvite.findFirst({
      where: and(
        eq(adminInvite.tokenHash, sha256(token)),
        isNull(adminInvite.acceptedAt),
        gt(adminInvite.expiresAt, new Date()),
      ),
    });
    if (!invite) throw new HttpError(404, "invite_invalid", "Die Einladung ist ungültig oder abgelaufen.");
    return invite;
  };

  app.get<{ Params: { token: string } }>("/invites/:token", async (request) => {
    const invite = await findOpenInvite(request.params.token);
    return { email: invite.email, expiresAt: invite.expiresAt.toISOString() } satisfies InvitePreview;
  });

  app.post<{ Params: { token: string } }>(
    "/invites/:token/accept",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const { password } = acceptBody.parse(request.body);
      const invite = await findOpenInvite(request.params.token);
      const passwordHash = await hashPassword(password);

      const admin = await db.transaction(async (tx) => {
        const existing = await tx.query.adminUser.findFirst({ where: eq(adminUser.email, invite.email) });
        if (existing) throw new HttpError(409, "admin_exists", "Für diese E-Mail gibt es bereits ein Konto.");
        const [created] = await tx
          .insert(adminUser)
          .values({
            accountId: invite.accountId,
            email: invite.email,
            passwordHash,
            invitedBy: invite.invitedBy,
            // Wer den Link aus der Einladung öffnet, hat Zugriff auf das Postfach.
            emailVerifiedAt: new Date(),
          })
          .returning({ id: adminUser.id });
        await tx.update(adminInvite).set({ acceptedAt: new Date() }).where(eq(adminInvite.id, invite.id));
        return created!;
      });

      const session = await createSession(db, admin.id);
      setSessionCookie(reply, session.token, session.expiresAt, cookieSecure);
      return reply.code(201).send((await loadAdminMe(db, admin.id))! satisfies AdminMe);
    },
  );
};
