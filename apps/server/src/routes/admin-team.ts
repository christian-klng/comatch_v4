import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AdminListItem, InviteCreated, InviteListItem } from "@comatch/shared";
import { normalizeEmail } from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { adminInvite, adminUser } from "../db/schema.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { randomToken, sha256 } from "../lib/tokens.ts";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const inviteBody = z.object({ email: z.email("Bitte eine gültige E-Mail eingeben.") });
const idParams = z.object({ id: z.uuid() });

/** Admins und Einladungen. Läuft im geschützten /admin-Bereich. */
export const adminTeamRoutes: FastifyPluginAsync<AppContext> = async (app, { db, publicBaseUrl }) => {
  const inviter = alias(adminUser, "inviter");

  app.get("/team", async () => {
    const admins = await db
      .select({
        id: adminUser.id,
        email: adminUser.email,
        createdAt: adminUser.createdAt,
        invitedByEmail: inviter.email,
      })
      .from(adminUser)
      .leftJoin(inviter, eq(inviter.id, adminUser.invitedBy))
      .orderBy(asc(adminUser.createdAt));

    const invites = await db
      .select({
        id: adminInvite.id,
        email: adminInvite.email,
        createdAt: adminInvite.createdAt,
        expiresAt: adminInvite.expiresAt,
        invitedByEmail: inviter.email,
      })
      .from(adminInvite)
      .leftJoin(inviter, eq(inviter.id, adminInvite.invitedBy))
      .where(and(isNull(adminInvite.acceptedAt), gt(adminInvite.expiresAt, new Date())))
      .orderBy(asc(adminInvite.createdAt));

    return {
      admins: admins.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }) satisfies AdminListItem),
      invites: invites.map(
        (i) =>
          ({
            ...i,
            createdAt: i.createdAt.toISOString(),
            expiresAt: i.expiresAt.toISOString(),
          }) satisfies InviteListItem,
      ),
    };
  });

  app.post("/invites", async (request, reply) => {
    const email = normalizeEmail(inviteBody.parse(request.body).email);
    if (await db.query.adminUser.findFirst({ where: eq(adminUser.email, email) })) {
      throw new HttpError(409, "admin_exists", "Diese Person ist bereits Admin.");
    }
    const token = randomToken();
    const [invite] = await db
      .insert(adminInvite)
      .values({
        email,
        tokenHash: sha256(token),
        invitedBy: request.admin!.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning();
    return reply.code(201).send({
      id: invite!.id,
      email: invite!.email,
      createdAt: invite!.createdAt.toISOString(),
      expiresAt: invite!.expiresAt.toISOString(),
      invitedByEmail: request.admin!.email,
      acceptUrl: `${publicBaseUrl}/invite/${token}`,
    } satisfies InviteCreated);
  });

  app.delete("/invites/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const deleted = await db
      .delete(adminInvite)
      .where(eq(adminInvite.id, id))
      .returning({ id: adminInvite.id });
    if (deleted.length === 0) throw notFound("invite_not_found");
    return reply.code(204).send();
  });

  app.delete("/admins/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    if (id === request.admin!.id) {
      throw new HttpError(409, "cannot_remove_self", "Du kannst dich nicht selbst entfernen.");
    }
    const deleted = await db.delete(adminUser).where(eq(adminUser.id, id)).returning({ id: adminUser.id });
    if (deleted.length === 0) throw notFound("admin_not_found");
    return reply.code(204).send();
  });
};
