import { and, eq, inArray } from "drizzle-orm";
import { WRONG_CODE_LOCK_MS } from "@comatch/shared";
import { matchGroup, matchMember, participant, round } from "../db/schema.ts";
import { HttpError } from "../lib/errors.ts";
import { similarity } from "../matching/index.ts";
import {
  completeIfConfirmed,
  loadPeople,
  loadQuestionsForMatching,
  rewriteMembers,
  type LiveEventRow,
  type Tx,
} from "./repository.ts";
import { notFoundFrom } from "./views.ts";

const matchChanged = () => new HttpError(409, "match_changed", "Dein Match hat sich inzwischen geändert.");

/** Lädt das offene Match einer Person in der laufenden Runde, sonst 409. */
async function loadOwnGroup(tx: Tx, ev: LiveEventRow, matchId: string, participantId: string) {
  if (ev.status !== "running") {
    throw new HttpError(409, "event_not_running", "Gerade läuft keine Runde.");
  }
  const [group] = await tx
    .select({
      id: matchGroup.id,
      status: matchGroup.status,
      createdAt: matchGroup.createdAt,
      roundNumber: round.number,
    })
    .from(matchGroup)
    .innerJoin(round, eq(round.id, matchGroup.roundId))
    .where(and(eq(matchGroup.id, matchId), eq(matchGroup.eventId, ev.id)))
    .for("update", { of: matchGroup });
  if (!group || group.roundNumber !== ev.currentRound || group.status === "expired") throw matchChanged();
  const members = await tx.select().from(matchMember).where(eq(matchMember.matchGroupId, matchId));
  const own = members.find((m) => m.participantId === participantId);
  if (!own) throw matchChanged();
  return { group, members, own };
}

/**
 * Prüft den gewählten Code. Richtig: Die Person hat bestätigt; haben alle bestätigt, ist das
 * Match bestätigt. Falsch: Fehlversuch zählen und kurz sperren.
 */
export async function submitCode(
  tx: Tx,
  ev: LiveEventRow,
  input: { participantId: string; matchId: string; code: string; now: number },
): Promise<"wrong" | "correct" | "confirmed"> {
  const { group, members, own } = await loadOwnGroup(tx, ev, input.matchId, input.participantId);
  if (group.status === "confirmed") return "confirmed";
  if (own.confirmedAt) return "correct";
  if (own.lastWrongAt && own.lastWrongAt.getTime() + WRONG_CODE_LOCK_MS > input.now) {
    throw new HttpError(429, "code_locked", "Kurz warten, dann noch einmal versuchen.");
  }

  const ownRow = and(
    eq(matchMember.matchGroupId, group.id),
    eq(matchMember.participantId, input.participantId),
  );
  const target = members.find((m) => m.participantId === own.confirmsParticipantId);
  if (target?.ownCode !== input.code) {
    await tx
      .update(matchMember)
      .set({ wrongAttempts: own.wrongAttempts + 1, lastWrongAt: new Date(input.now) })
      .where(ownRow);
    return "wrong";
  }

  await tx
    .update(matchMember)
    .set({ confirmedAt: new Date(input.now) })
    .where(ownRow);
  return (await completeIfConfirmed(tx, group.id, new Date(input.now))) ? "confirmed" : "correct";
}

/**
 * „Nicht gefunden“: Die Person verlässt ihr Match und wartet ohne Wartezeit im Pool. Bei einem
 * Paar löst sich das Match auf; in einer Dreiergruppe suchen die anderen beiden weiter.
 */
export async function giveUpMatch(
  tx: Tx,
  ev: LiveEventRow,
  input: { participantId: string; matchId: string; now: number },
) {
  const { group, members, own } = await loadOwnGroup(tx, ev, input.matchId, input.participantId);
  if (group.status !== "open" || own.confirmedAt) throw matchChanged();
  const from = notFoundFrom(ev, group);
  if (from === null || input.now < from) {
    throw new HttpError(409, "not_found_too_early", "Sucht noch ein wenig weiter.");
  }

  const backToPool = [input.participantId];
  if (members.length <= 2) {
    await tx.update(matchGroup).set({ status: "expired" }).where(eq(matchGroup.id, group.id));
    backToPool.push(...members.map((m) => m.participantId).filter((id) => id !== input.participantId));
  } else {
    const rest = members.map((m) => m.participantId).filter((id) => id !== input.participantId);
    const [questions, people] = await Promise.all([
      loadQuestionsForMatching(tx, ev.id),
      loadPeople(tx, rest),
    ]);
    await tx
      .delete(matchMember)
      .where(and(eq(matchMember.matchGroupId, group.id), eq(matchMember.participantId, input.participantId)));
    await rewriteMembers(tx, group.id, rest, similarity(questions, people[0]!, people[1]!));
    await completeIfConfirmed(tx, group.id, new Date(input.now));
  }

  // Sie haben schon gesucht: sofort wieder vermittelbar.
  await tx
    .update(participant)
    .set({ status: "pool", poolSince: new Date(input.now - ev.firstMatchDelayS * 1000) })
    .where(and(inArray(participant.id, backToPool), eq(participant.status, "matched")));
}
