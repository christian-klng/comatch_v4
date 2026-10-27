import { sql as rawSql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDb } from "../src/db/client.ts";
import { adminUser } from "../src/db/schema.ts";
import { hashPassword } from "../src/lib/password.ts";
import { TEST_DATABASE_URL } from "./db-url.ts";

export const PUBLIC_BASE_URL = "http://comatch.test";

/**
 * Baut eine App gegen die Test-Datenbank und leert vor jedem Test alle Tabellen.
 * In einer Testdatei auf oberster Ebene aufrufen.
 */
export function useTestApp() {
  const { db, sql } = createDb(TEST_DATABASE_URL);
  const appPromise = buildApp({ db, publicBaseUrl: PUBLIC_BASE_URL, cookieSecure: false });

  beforeEach(async () => {
    const tables = await db.execute<{ tablename: string }>(
      rawSql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const names = tables.map((t) => `"${t.tablename}"`).join(", ");
    if (names) await db.execute(rawSql.raw(`truncate ${names} restart identity cascade`));
  });

  afterAll(async () => {
    await (await appPromise).close();
    await sql.end();
  });

  const ctx = {
    db,
    app: () => appPromise,

    async createAdmin(email = "admin@test.local", password = "richtig-langes-passwort") {
      const [admin] = await db
        .insert(adminUser)
        .values({ email, passwordHash: await hashPassword(password) })
        .returning();
      return { ...admin!, password };
    },

    /** Legt einen Admin an, meldet ihn an und gibt das Session-Cookie zurück. */
    async loginAs(email = "admin@test.local") {
      const admin = await ctx.createAdmin(email);
      const res = await (
        await appPromise
      ).inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: admin.password },
      });
      const cookie = res.cookies.find((c) => c.name === "comatch_admin");
      if (!cookie) throw new Error(`Login fehlgeschlagen: ${res.statusCode} ${res.body}`);
      return { admin, cookie: `${cookie.name}=${cookie.value}` };
    },
  };
  return ctx;
}
