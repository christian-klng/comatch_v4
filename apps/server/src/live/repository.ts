import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { EventStatus, MatchGroupKind } from "@comatch/shared";
import type { Db } from "../db/client.ts";
import {
  answerOption,
  event,
  matchGroup,
  matchMember,
  optionComplement,
  pairHistory,
  participant,
  participantAnswer,
  question,
  round,
} from "../db/schema.ts";
import { pairKey, type MatchPerson, type MatchQuestion, type PlannedGroup } from "../matching/index.ts";
import { assignCodes } from "./codes.ts";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

/** Spalten, die der Live-Betrieb braucht (ohne das Logo, das bis 512 KB groß sein kann). */
export const liveEventColumns = {
  id: event.id,
  status: event.status,
  currentRound: event.currentRound,
  roundEndsAt: event.roundEndsAt,
  pausedRemainingMs: event.pausedRemainingMs,
  roundDurationS: event.roundDurationS,
  firstMatchDelayS: event.firstMatchDelayS,
};
export interface LiveEventRow {
  id: string;
  status: EventStatus;
  currentRound: number;
  roundEndsAt: Date | null;
  pausedRemainingMs: number | null;
  roundDurationS: number;
  firstMatchDelayS: number;
}
export type ParticipantRow = typeof participant.$inferSelect;

// ---------------------------------------------------------------------------
// Eingaben für die Matching-Engine
// ---------------------------------------------------------------------------

export async function loadQuestionsForMatching(db: Conn, eventId: string): Promise<MatchQuestion[]> {
  const questions = await db
    .select({ id: question.id, matchMode: question.matchMode, weight: question.weight })
    .from(question)
    .where(eq(question.eventId, eventId))
    .orderBy(asc(question.position));
  const links = await db
    .select({
      from: optionComplement.optionId,
      to: optionComplement.complementOptionId,
      questionId: answerOption.questionId,
    })
    .from(optionComplement)
    .innerJoin(answerOption, eq(answerOption.id, optionComplement.optionId))
    .innerJoin(question, eq(question.id, answerOption.questionId))
    .where(eq(question.eventId, eventId));

  return questions.map((q) => {
    const complements = new Map<string, Set<string>>();
    for (const link of links.filter((l) => l.questionId === q.id)) {
      if (!complements.has(link.from)) complements.set(link.from, new Set());
      complements.get(link.from)!.add(link.to);
    }
    return { ...q, complements };
  });
}

export async function loadPeople(db: Conn, participantIds: readonly string[]): Promise<MatchPerson[]> {
  if (participantIds.length === 0) return [];
  const rows = await db
    .select()
    .from(participantAnswer)
    .where(inArray(participantAnswer.participantId, [...participantIds]));
  return participantIds.map((id) => ({
    id,
    answers: Object.fromEntries(
      rows.filter((r) => r.participantId === id).map((r) => [r.questionId, r.answerOptionId]),
    ),
  }));
}

export async function loadHistory(db: Conn, eventId: string) {
  const rows = await db.select().from(pairHistory).where(eq(pairHistory.eventId, eventId));
  return new Map(
    rows.map((r) => [
      pairKey(r.participantA, r.participantB),
      { timesMet: r.timesMet, lastRound: r.lastRound },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Runden und Gruppen schreiben
// ---------------------------------------------------------------------------

export async function loadLiveEvent(db: Conn, eventId: string, lock = false): Promise<LiveEventRow | null> {
  const query = db.select(liveEventColumns).from(event).where(eq(event.id, eventId));
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

export async function currentRoundRow(db: Conn, ev: Pick<LiveEventRow, "id" | "currentRound">) {
  if (ev.currentRound === 0) return null;
  const [row] = await db
    .select()
    .from(round)
    .where(and(eq(round.eventId, ev.id), eq(round.number, ev.currentRound)));
  return row ?? null;
}

async function recordPairs(tx: Tx, eventId: string, members: readonly string[], roundNumber: number) {
  const values = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const [a, b] = [members[i]!, members[j]!].sort() as [string, string];
      values.push({ eventId, participantA: a, participantB: b, timesMet: 1, lastRound: roundNumber });
    }
  }
  if (values.length === 0) return;
  await tx
    .insert(pairHistory)
    .values(values)
    .onConflictDoUpdate({
      target: [pairHistory.eventId, pairHistory.participantA, pairHistory.participantB],
      set: { timesMet: sql`${pairHistory.timesMet} + 1`, lastRound: roundNumber },
    });
}

/** Legt geplante Gruppen samt Codes an, schreibt die Historie fort und setzt die Personen auf „matched“. */
export async function insertGroups(
  tx: Tx,
  opts: {
    eventId: string;
    roundId: string;
    roundNumber: number;
    kind: MatchGroupKind;
    groups: readonly PlannedGroup[];
  },
) {
  for (const group of opts.groups) {
    const [created] = await tx
      .insert(matchGroup)
      .values({ eventId: opts.eventId, roundId: opts.roundId, kind: opts.kind, similarity: group.similarity })
      .returning({ id: matchGroup.id });
    await tx
      .insert(matchMember)
      .values(assignCodes(group.members).map((m) => ({ ...m, matchGroupId: created!.id })));
    await recordPairs(tx, opts.eventId, group.members, opts.roundNumber);
  }
  const ids = opts.groups.flatMap((g) => g.members);
  if (ids.length > 0) {
    await tx
      .update(participant)
      .set({ status: "matched", poolSince: null })
      .where(inArray(participant.id, ids));
  }
}

/** Setzt die Mitglieder einer Gruppe neu (Dritte kommt dazu oder jemand ist gegangen); Codes bleiben erhalten. */
export async function rewriteMembers(
  tx: Tx,
  groupId: string,
  memberIds: readonly string[],
  similarity: number,
) {
  const existing = await tx.select().from(matchMember).where(eq(matchMember.matchGroupId, groupId));
  const codes = new Map(existing.map((m) => [m.participantId, m.ownCode]));
  await tx.delete(matchMember).where(eq(matchMember.matchGroupId, groupId));
  await tx
    .insert(matchMember)
    .values(assignCodes(memberIds, codes).map((m) => ({ ...m, matchGroupId: groupId })));
  await tx.update(matchGroup).set({ similarity }).where(eq(matchGroup.id, groupId));
}

export async function addToGroup(
  tx: Tx,
  eventId: string,
  roundNumber: number,
  groupId: string,
  group: PlannedGroup,
) {
  await rewriteMembers(tx, groupId, group.members, group.similarity);
  await recordPairs(tx, eventId, group.members, roundNumber);
  await tx
    .update(participant)
    .set({ status: "matched", poolSince: null })
    .where(inArray(participant.id, [...group.members]));
}

// ---------------------------------------------------------------------------
// Zustand lesen
// ---------------------------------------------------------------------------

export interface GroupView {
  id: string;
  kind: MatchGroupKind;
  status: "open" | "confirmed" | "expired";
  similarity: number;
  members: {
    participantId: string;
    ownCode: string;
    confirmsParticipantId: string;
    confirmedAt: Date | null;
  }[];
}

/** Gruppen der laufenden Runde mit Mitgliedern. */
export async function loadRoundGroups(db: Conn, roundId: string | null): Promise<GroupView[]> {
  if (!roundId) return [];
  const groups = await db.select().from(matchGroup).where(eq(matchGroup.roundId, roundId));
  if (groups.length === 0) return [];
  const members = await db
    .select()
    .from(matchMember)
    .where(
      inArray(
        matchMember.matchGroupId,
        groups.map((g) => g.id),
      ),
    );
  return groups.map((g) => ({
    id: g.id,
    kind: g.kind,
    status: g.status,
    similarity: g.similarity,
    members: members
      .filter((m) => m.matchGroupId === g.id)
      .map((m) => ({
        participantId: m.participantId,
        ownCode: m.ownCode,
        confirmsParticipantId: m.confirmsParticipantId,
        confirmedAt: m.confirmedAt,
      })),
  }));
}

export interface LiveSnapshot {
  event: LiveEventRow;
  participants: ParticipantRow[];
  groups: GroupView[];
}

export async function loadSnapshot(db: Conn, eventId: string): Promise<LiveSnapshot | null> {
  const ev = await loadLiveEvent(db, eventId);
  if (!ev) return null;
  const [participants, roundRow] = await Promise.all([
    db.select().from(participant).where(eq(participant.eventId, eventId)),
    currentRoundRow(db, ev),
  ]);
  return { event: ev, participants, groups: await loadRoundGroups(db, roundRow?.id ?? null) };
}
