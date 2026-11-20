import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { accountDeleteInput, accountInput, ownerTransferInput, type AccountDetail } from "@comatch/shared";
import { clearSessionCookie, loadAdminMe, requireOwner } from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { account, adminUser, event } from "../db/schema.ts";
import { HttpError, notFound } from "../lib/errors.ts";

/** Das eigene Konto: Name, Veranstalter-Angaben, Inhaber*in. Läuft im geschützten /admin-Bereich. */
export const adminAccountRoutes: FastifyPluginAsync<AppContext> = async (app, { db, storage, live }) => {
  const detail = async (accountId: string): Promise<AccountDetail> => {
    const row = await db.query.account.findFirst({ where: eq(account.id, accountId) });
    if (!row) throw notFound("account_not_found");
    return {
      id: row.id,
      name: row.name,
      legalName: row.legalName,
      legalAddress: row.legalAddress,
      legalEmail: row.legalEmail,
      legalFromOperator: row.legalFromOperator,
    };
  };

  app.get("/account", async (request) => detail(request.admin!.accountId));

  app.put("/account", { onRequest: requireOwner }, async (request) => {
    const input = accountInput.parse(request.body);
    await db.update(account).set(input).where(eq(account.id, request.admin!.accountId));
    return detail(request.admin!.accountId);
  });

  /**
   * Löscht das Konto mit allen Events, Fotos, Mitgliedern und Einladungen. Zur Sicherheit muss
   * der Name des Kontos mitgeschickt werden; laufende Events müssen vorher beendet sein.
   */
  app.delete("/account", { onRequest: requireOwner }, async (request, reply) => {
    const { confirmName } = accountDeleteInput.parse(request.body);
    const { accountId, accountName } = request.admin!;
    if (confirmName.trim() !== accountName) {
      throw new HttpError(
        400,
        "confirm_mismatch",
        "Der eingegebene Name stimmt nicht mit dem Konto überein.",
      );
    }
    const events = await db
      .select({ id: event.id, status: event.status })
      .from(event)
      .where(eq(event.accountId, accountId));
    if (events.some((e) => e.status === "running" || e.status === "paused")) {
      throw new HttpError(
        409,
        "event_live",
        "Es läuft noch ein Event. Bitte zuerst beenden, dann lässt sich das Konto löschen.",
      );
    }
    for (const e of events) live.forget(e.id);
    await db.transaction(async (tx) => {
      await tx.delete(event).where(eq(event.accountId, accountId));
      // Nimmt Mitglieder, Sitzungen, Einladungen und offene Links mit.
      await tx.delete(account).where(eq(account.id, accountId));
    });
    for (const e of events) await storage.deletePrefix(`events/${e.id}/`);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  /** Übergibt das Konto an ein anderes Mitglied; man selbst wird Mitglied. */
  app.post("/account/owner", { onRequest: requireOwner }, async (request) => {
    const { adminId } = ownerTransferInput.parse(request.body);
    const me = request.admin!;
    await db.transaction(async (tx) => {
      const target = await tx.query.adminUser.findFirst({
        where: and(eq(adminUser.id, adminId), eq(adminUser.accountId, me.accountId)),
        columns: { id: true, role: true },
      });
      if (!target || target.id === me.id) throw notFound("admin_not_found");
      // Reihenfolge wegen des Index „eine*r je Konto“: erst abgeben, dann vergeben.
      await tx.update(adminUser).set({ role: "member" }).where(eq(adminUser.id, me.id));
      await tx.update(adminUser).set({ role: "owner" }).where(eq(adminUser.id, target.id));
    });
    return (await loadAdminMe(db, me.id))!;
  });
};
