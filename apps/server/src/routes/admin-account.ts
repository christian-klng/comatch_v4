import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { accountInput, ownerTransferInput, type AccountDetail } from "@comatch/shared";
import { loadAdminMe, requireOwner } from "../auth/session.ts";
import type { AppContext } from "../context.ts";
import { account, adminUser } from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";

/** Das eigene Konto: Name, Veranstalter-Angaben, Inhaber*in. Läuft im geschützten /admin-Bereich. */
export const adminAccountRoutes: FastifyPluginAsync<AppContext> = async (app, { db }) => {
  const detail = async (accountId: string): Promise<AccountDetail> => {
    const row = await db.query.account.findFirst({ where: eq(account.id, accountId) });
    if (!row) throw notFound("account_not_found");
    return {
      id: row.id,
      name: row.name,
      legalName: row.legalName,
      legalAddress: row.legalAddress,
      legalEmail: row.legalEmail,
    };
  };

  app.get("/account", async (request) => detail(request.admin!.accountId));

  app.put("/account", { onRequest: requireOwner }, async (request) => {
    const input = accountInput.parse(request.body);
    await db.update(account).set(input).where(eq(account.id, request.admin!.accountId));
    return detail(request.admin!.accountId);
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
