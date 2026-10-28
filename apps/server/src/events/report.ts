import { asc, eq } from "drizzle-orm";
import type { AdminParticipant, EventStats, MatchGroupKind, ParticipantStatus } from "@comatch/shared";
import type { Db } from "../db/client.ts";
import {
  answerOption,
  matchGroup,
  matchMember,
  participant,
  participantAnswer,
  question,
  round,
} from "../db/schema.ts";
import type { MediaSigner } from "../lib/media.ts";

/** Zeitzone für Exporte (Events finden in Deutschland statt). */
const TIME_ZONE = "Europe/Berlin";

/** Alles, was Moderationsliste, Statistik und Export brauchen, in wenigen Abfragen. */
async function loadReport(db: Db, eventId: string) {
  const [people, questions, labels, answers, groups, members] = await Promise.all([
    db
      .select({
        id: participant.id,
        status: participant.status,
        selfieKey: participant.selfieKey,
        joinedAt: participant.joinedAt,
        lastSeenAt: participant.lastSeenAt,
      })
      .from(participant)
      .where(eq(participant.eventId, eventId))
      .orderBy(asc(participant.joinedAt), asc(participant.id)),
    db
      .select({ id: question.id, text: question.text })
      .from(question)
      .where(eq(question.eventId, eventId))
      .orderBy(asc(question.position)),
    db
      .select({ id: answerOption.id, label: answerOption.label })
      .from(answerOption)
      .innerJoin(question, eq(question.id, answerOption.questionId))
      .where(eq(question.eventId, eventId)),
    db
      .select({
        participantId: participantAnswer.participantId,
        questionId: participantAnswer.questionId,
        optionId: participantAnswer.answerOptionId,
      })
      .from(participantAnswer)
      .innerJoin(participant, eq(participant.id, participantAnswer.participantId))
      .where(eq(participant.eventId, eventId)),
    db
      .select({
        id: matchGroup.id,
        kind: matchGroup.kind,
        status: matchGroup.status,
        similarity: matchGroup.similarity,
        createdAt: matchGroup.createdAt,
        confirmedAt: matchGroup.confirmedAt,
        round: round.number,
      })
      .from(matchGroup)
      .innerJoin(round, eq(round.id, matchGroup.roundId))
      .where(eq(matchGroup.eventId, eventId))
      .orderBy(asc(round.number), asc(matchGroup.createdAt)),
    db
      .select({ groupId: matchMember.matchGroupId, participantId: matchMember.participantId })
      .from(matchMember)
      .innerJoin(matchGroup, eq(matchGroup.id, matchMember.matchGroupId))
      .where(eq(matchGroup.eventId, eventId)),
  ]);

  // Nummern nach Beitritt; entfernte Personen behalten ihre, damit Exporte stabil bleiben.
  const numbers = new Map(people.map((p, i) => [p.id, `T${String(i + 1).padStart(3, "0")}`]));
  const labelOf = new Map(labels.map((l) => [l.id, l.label]));
  const answerLabels = (participantId: string) =>
    questions.map((q) => {
      const row = answers.find((a) => a.participantId === participantId && a.questionId === q.id);
      return row ? (labelOf.get(row.optionId) ?? "") : "";
    });
  const membersOf = new Map<string, string[]>();
  for (const m of members) membersOf.set(m.groupId, [...(membersOf.get(m.groupId) ?? []), m.participantId]);
  const matchCount = (participantId: string, onlyConfirmed: boolean) =>
    groups.filter(
      (g) => (!onlyConfirmed || g.status === "confirmed") && membersOf.get(g.id)?.includes(participantId),
    ).length;

  return { people, questions, groups, numbers, answerLabels, membersOf, matchCount };
}

export async function listParticipants(
  db: Db,
  media: MediaSigner,
  eventId: string,
  isPresent: (p: { id: string; lastSeenAt: Date }) => boolean,
): Promise<AdminParticipant[]> {
  const report = await loadReport(db, eventId);
  return report.people
    .filter((p) => p.status !== "removed")
    .map((p) => ({
      id: p.id,
      number: report.numbers.get(p.id)!,
      status: p.status,
      selfieUrl: p.selfieKey ? media.url(p.selfieKey) : null,
      joinedAt: p.joinedAt.toISOString(),
      online: isPresent(p),
      answers: report.answerLabels(p.id),
      confirmedMatches: report.matchCount(p.id, true),
    }));
}

const rate = (confirmed: number, expired: number) =>
  confirmed + expired > 0 ? confirmed / (confirmed + expired) : null;

export async function eventStats(db: Db, eventId: string): Promise<EventStats> {
  const { people, groups, matchCount } = await loadReport(db, eventId);
  const joined = people.filter((p) => p.status !== "removed" && p.status !== "onboarding");
  const counts = joined.map((p) => matchCount(p.id, true)).sort((a, b) => a - b);
  const max = counts.at(-1) ?? 0;
  const mid = Math.floor(counts.length / 2);
  const median =
    counts.length === 0 ? 0 : counts.length % 2 ? counts[mid]! : (counts[mid - 1]! + counts[mid]!) / 2;

  const tally = (list: typeof groups) => ({
    matches: list.length,
    confirmed: list.filter((g) => g.status === "confirmed").length,
    expired: list.filter((g) => g.status === "expired").length,
  });
  const all = tally(groups);
  const rounds = [...new Set(groups.map((g) => g.round))];
  const byKind = (kind: MatchGroupKind) => {
    const { matches, confirmed } = tally(groups.filter((g) => g.kind === kind));
    return { matches, confirmed };
  };

  return {
    participants: joined.length,
    rounds: rounds.length,
    matches: {
      total: all.matches,
      confirmed: all.confirmed,
      expired: all.expired,
      open: all.matches - all.confirmed - all.expired,
      confirmationRate: rate(all.confirmed, all.expired),
    },
    perPerson: {
      average: counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
      median,
      max,
      withoutMatch: counts.filter((c) => c === 0).length,
      histogram: Array.from({ length: max + 1 }, (_, n) => ({
        matches: n,
        people: counts.filter((c) => c === n).length,
      })),
    },
    byRound: rounds.map((n) => {
      const t = tally(groups.filter((g) => g.round === n));
      return {
        round: n,
        matches: t.matches,
        confirmed: t.confirmed,
        confirmationRate: rate(t.confirmed, t.expired),
      };
    }),
    byKind: { round: byKind("round"), pool: byKind("pool") },
  };
}

// ---------------------------------------------------------------------------
// CSV-Export (Semikolon und BOM, damit Excel in Deutschland es direkt öffnet)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<ParticipantStatus, string> = {
  onboarding: "ohne Selfie",
  pool: "wartet",
  matched: "im Match",
  confirmed: "bestätigt",
  inactive: "inaktiv",
  removed: "entfernt",
};
const GROUP_STATUS_LABELS = { open: "offen", confirmed: "bestätigt", expired: "nicht bestätigt" } as const;
const KIND_LABELS: Record<MatchGroupKind, string> = { round: "Runde", pool: "Nachzügler" };

const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  dateStyle: "short",
  timeStyle: "medium",
});
const formatDate = (date: Date | null) => (date ? dateFormat.format(date) : "");

function csvCell(value: string | number): string {
  const text = String(value);
  // Führende =, +, -, @ würden Tabellenprogramme als Formel lesen.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function toCsv(rows: (string | number)[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export async function matchesCsv(db: Db, eventId: string): Promise<string> {
  const { groups, membersOf, numbers } = await loadReport(db, eventId);
  return toCsv([
    ["Runde", "Art", "Status", "Übereinstimmung (%)", "Erstellt", "Bestätigt", "Personen"],
    ...groups.map((g) => [
      g.round,
      KIND_LABELS[g.kind],
      GROUP_STATUS_LABELS[g.status],
      Math.round(g.similarity * 100),
      formatDate(g.createdAt),
      formatDate(g.confirmedAt),
      (membersOf.get(g.id) ?? [])
        .map((id) => numbers.get(id) ?? "")
        .sort()
        .join(", "),
    ]),
  ]);
}

export async function participantsCsv(db: Db, eventId: string): Promise<string> {
  const { people, questions, numbers, answerLabels, matchCount } = await loadReport(db, eventId);
  return toCsv([
    ["Nr", "Beigetreten", "Status", ...questions.map((q) => q.text), "Bestätigte Matches", "Matches gesamt"],
    ...people.map((p) => [
      numbers.get(p.id)!,
      formatDate(p.joinedAt),
      STATUS_LABELS[p.status],
      ...answerLabels(p.id),
      matchCount(p.id, true),
      matchCount(p.id, false),
    ]),
  ]);
}
