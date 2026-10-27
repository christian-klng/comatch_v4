import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Db } from "../db/client.ts";
import { participant } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { sha256 } from "../lib/tokens.ts";

export type ParticipantRow = typeof participant.$inferSelect;

declare module "fastify" {
  interface FastifyRequest {
    participant: ParticipantRow | null;
  }
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

/** onRequest-Hook: lädt die teilnehmende Person aus dem Bearer-Token oder antwortet mit 401. */
export function requireParticipant(db: Db) {
  return async (request: FastifyRequest) => {
    const token = bearerToken(request);
    const row = token
      ? await db.query.participant.findFirst({ where: eq(participant.sessionTokenHash, sha256(token)) })
      : undefined;
    if (!row || row.status === "removed") {
      throw new HttpError(401, "participant_unknown", "Deine Sitzung ist abgelaufen. Bitte neu beitreten.");
    }
    request.participant = row;
  };
}
