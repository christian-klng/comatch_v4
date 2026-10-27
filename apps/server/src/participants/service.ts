import { asc, eq } from "drizzle-orm";
import {
  MAX_PARTICIPANTS_PER_EVENT,
  isJoinable,
  type EventStatus,
  type JoinInput,
  type ParticipantMe,
  type PublicEvent,
} from "@comatch/shared";
import type { Db } from "../db/client.ts";
import { answerOption, event, participant, participantAnswer, question } from "../db/schema.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import type { MediaSigner } from "../lib/media.ts";
import { randomToken, sha256 } from "../lib/tokens.ts";
import type { ParticipantRow } from "./session.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const NOT_JOINABLE: Partial<Record<EventStatus, string>> = {
  draft: "Das Event ist noch nicht geöffnet. Bitte versuche es gleich noch einmal.",
  ended: "Dieses Event ist bereits vorbei.",
};

/** Speicherort aller Selfies einer Person; beim Austritt wird das ganze Verzeichnis gelöscht. */
export const selfiePrefix = (eventId: string, participantId: string) =>
  `events/${eventId}/selfies/${participantId}/`;

async function loadPublicQuestions(db: Db | Tx, eventId: string): Promise<PublicEvent["questions"]> {
  const rows = await db
    .select({
      questionId: question.id,
      text: question.text,
      optionId: answerOption.id,
      label: answerOption.label,
    })
    .from(question)
    .innerJoin(answerOption, eq(answerOption.questionId, question.id))
    .where(eq(question.eventId, eventId))
    .orderBy(asc(question.position), asc(answerOption.position));

  const questions: PublicEvent["questions"] = [];
  for (const row of rows) {
    let q = questions.at(-1);
    if (q?.id !== row.questionId) {
      q = { id: row.questionId, text: row.text, options: [] };
      questions.push(q);
    }
    q.options.push({ id: row.optionId, label: row.label });
  }
  return questions;
}

export async function getPublicEvent(db: Db, slug: string): Promise<PublicEvent> {
  const row = await db.query.event.findFirst({ where: eq(event.slug, slug) });
  if (!row) throw notFound("event_not_found");
  return {
    slug: row.slug,
    title: row.title,
    status: row.status,
    joinable: isJoinable(row.status),
    roundDurationS: row.roundDurationS,
    logoUrl: row.logoUpdatedAt ? `/api/events/${row.slug}/logo?v=${row.logoUpdatedAt.getTime()}` : null,
    primaryColor: row.primaryColor,
    questions: await loadPublicQuestions(db, row.id),
  };
}

/** Legt eine teilnehmende Person mit ihren Antworten an und gibt das Sitzungstoken zurück. */
export async function joinEvent(
  db: Db,
  slug: string,
  input: JoinInput,
): Promise<{ token: string; participant: ParticipantRow }> {
  return db.transaction(async (tx) => {
    // Sperrt das Event, damit sich die Fragen nicht gleichzeitig ändern (siehe replaceQuestions).
    const [row] = await tx.select().from(event).where(eq(event.slug, slug)).for("update");
    if (!row) throw notFound("event_not_found");
    if (!isJoinable(row.status)) {
      throw new HttpError(409, "event_not_joinable", NOT_JOINABLE[row.status] ?? "Beitritt nicht möglich.");
    }
    if ((await tx.$count(participant, eq(participant.eventId, row.id))) >= MAX_PARTICIPANTS_PER_EVENT) {
      throw new HttpError(409, "event_full", "Das Event ist voll.");
    }

    const questions = await loadPublicQuestions(tx, row.id);
    const valid =
      questions.length === input.answers.length &&
      questions.every((q, i) => q.options.some((o) => o.id === input.answers[i]));
    if (!valid) {
      throw new HttpError(
        409,
        "questions_changed",
        "Die Fragen wurden gerade geändert. Bitte lade die Seite neu.",
      );
    }

    const token = randomToken();
    const [created] = await tx
      .insert(participant)
      .values({ eventId: row.id, sessionTokenHash: sha256(token), consentAt: new Date() })
      .returning();
    await tx.insert(participantAnswer).values(
      questions.map((q, i) => ({
        participantId: created!.id,
        questionId: q.id,
        answerOptionId: input.answers[i]!,
      })),
    );
    return { token, participant: created! };
  });
}

export async function getParticipantMe(
  db: Db,
  media: MediaSigner,
  row: Pick<ParticipantRow, "id" | "eventId" | "status" | "selfieKey">,
): Promise<ParticipantMe> {
  const [ev, answers] = await Promise.all([
    db.query.event.findFirst({ where: eq(event.id, row.eventId), columns: { slug: true } }),
    db
      .select({ optionId: participantAnswer.answerOptionId })
      .from(participantAnswer)
      .innerJoin(question, eq(question.id, participantAnswer.questionId))
      .where(eq(participantAnswer.participantId, row.id))
      .orderBy(asc(question.position)),
  ]);
  return {
    id: row.id,
    eventSlug: ev!.slug,
    status: row.status,
    selfieUrl: row.selfieKey ? media.url(row.selfieKey) : null,
    answers: answers.map((a) => a.optionId),
  };
}
