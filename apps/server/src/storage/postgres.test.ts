import { afterAll, describe } from "vitest";
import { createDb } from "../db/client.ts";
import { mediaObject } from "../db/schema.ts";
import { storageContract } from "../../test/storage-contract.ts";
import { TEST_DATABASE_URL } from "../../test/db-url.ts";
import { createPostgresStorage } from "./postgres.ts";

const { db, sql } = createDb(TEST_DATABASE_URL);
afterAll(() => sql.end());

describe("Postgres-Speicher", () => {
  storageContract(createPostgresStorage(db), async () => {
    await db.delete(mediaObject);
  });
});
