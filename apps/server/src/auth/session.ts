import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminMe } from "@comatch/shared";
import type { Db } from "../db/client.ts";
import { adminSession, adminUser } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { randomToken, sha256 } from "../lib/tokens.ts";

export const SESSION_COOKIE = "comatch_admin";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

declare module "fastify" {
  interface FastifyRequest {
    admin: AdminMe | null;
  }
}

export async function createSession(db: Db, adminId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(adminSession).values({ tokenHash: sha256(token), adminId, expiresAt });
  return { token, expiresAt };
}

export async function findAdminBySession(db: Db, token: string): Promise<AdminMe | null> {
  const [row] = await db
    .select({ id: adminUser.id, email: adminUser.email })
    .from(adminSession)
    .innerJoin(adminUser, eq(adminUser.id, adminSession.adminId))
    .where(and(eq(adminSession.tokenHash, sha256(token)), gt(adminSession.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(adminSession).where(eq(adminSession.tokenHash, sha256(token)));
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** onRequest-Hook: lädt die Admin-Session aus dem Cookie oder antwortet mit 401. */
export function requireAdmin(db: Db) {
  return async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    request.admin = token ? await findAdminBySession(db, token) : null;
    if (!request.admin) throw new HttpError(401, "unauthorized", "Bitte anmelden.");
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
