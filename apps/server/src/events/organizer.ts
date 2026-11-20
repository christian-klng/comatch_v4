import type { Organizer } from "@comatch/shared";
import type { account } from "../db/schema.ts";

type LegalColumns = Pick<typeof account.$inferSelect, "legalName" | "legalAddress" | "legalEmail">;

/** Die Veranstalter-Angaben eines Kontos, wenn sie vollständig sind. */
export function organizerOf(row: LegalColumns): Organizer | null {
  if (!row.legalName || !row.legalAddress || !row.legalEmail) return null;
  return { name: row.legalName, address: row.legalAddress, email: row.legalEmail };
}
