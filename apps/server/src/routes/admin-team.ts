import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AdminListItem, InviteCreated, InviteListItem } from "@comatch/shared";
import { normalizeEmail, requireOwner } from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { adminInvite, adminUser } from "../db/schema.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { inviteMail } from "../mail/templates.ts";
import { randomToken, sha256 } from "../lib/tokens.ts";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const inviteBody = z.object({ email: z.email("Bitte eine gültige E-Mail eingeben.") });
const idParams = z.object({ id: z.uuid() });

/** Admins und Einladungen des eigenen Kontos; ändern darf nur die*der Inhaber*in. */
export const adminTeamRoutes: FastifyPluginAsync<AppContext> = async (app, { db, mailer, publicBaseUrl }) => {
  const inviter = alias(adminUser, "inviter");

  app.get("/team", async (request) => {
    const accountId = request.admin!.accountId;
    const admins = await db
      .select({
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        createdAt: adminUser.createdAt,
        invitedByEmail: inviter.email,
      })
      .from(adminUser)
      .leftJoin(inviter, eq(inviter.id, adminUser.invitedBy))
      .where(eq(adminUser.accountId, accountId))
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
      .where(
        and(
          eq(adminInvite.accountId, accountId),
          isNull(adminInvite.acceptedAt),
          gt(adminInvite.expiresAt, new Date()),
        ),
      )
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

  app.post("/invites", { onRequest: requireOwner }, async (request, reply) => {
    const email = normalizeEmail(inviteBody.parse(request.body).email);
    // E-Mails sind über alle Konten hinweg eindeutig: Eine Person gehört zu genau einem Konto.
    if (await db.query.adminUser.findFirst({ where: eq(adminUser.email, email) })) {
      throw new HttpError(409, "admin_exists", "Für diese E-Mail gibt es bereits ein Konto.");
    }
    const token = randomToken();
    const [invite] = await db
      .insert(adminInvite)
      .values({
        accountId: request.admin!.accountId,
        email,
        tokenHash: sha256(token),
        invitedBy: request.admin!.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning();
    const acceptUrl = `${publicBaseUrl}/invite/${token}`;
    // Der Link wird zusätzlich angezeigt; scheitert die Mail, gibt man ihn selbst weiter.
    let mailed = false;
    if (mailer.enabled) {
      try {
        await mailer.send(
          inviteMail(email, {
            accountName: request.admin!.accountName,
            inviter: request.admin!.email,
            url: acceptUrl,
          }),
        );
        mailed = true;
      } catch (err) {
        request.log.error({ err }, "Einladung nicht per Mail verschickt");
      }
    }
    return reply.code(201).send({
      id: invite!.id,
      email: invite!.email,
      createdAt: invite!.createdAt.toISOString(),
      expiresAt: invite!.expiresAt.toISOString(),
      invitedByEmail: request.admin!.email,
      acceptUrl,
      mailed,
    } satisfies InviteCreated);
  });

  app.delete("/invites/:id", { onRequest: requireOwner }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const deleted = await db
      .delete(adminInvite)
      .where(and(eq(adminInvite.id, id), eq(adminInvite.accountId, request.admin!.accountId)))
      .returning({ id: adminInvite.id });
    if (deleted.length === 0) throw notFound("invite_not_found");
    return reply.code(204).send();
  });

  app.delete("/admins/:id", { onRequest: requireOwner }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    if (id === request.admin!.id) {
      throw new HttpError(409, "cannot_remove_self", "Du kannst dich nicht selbst entfernen.");
    }
    const deleted = await db
      .delete(adminUser)
      .where(and(eq(adminUser.id, id), eq(adminUser.accountId, request.admin!.accountId)))
      .returning({ id: adminUser.id });
    if (deleted.length === 0) throw notFound("admin_not_found");
    return reply.code(204).send();
  });
};
