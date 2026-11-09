import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import {
  normalizeComplements,
  type EventCreateInput,
  type EventDetail,
  type EventSummary,
  type Language,
  type QuestionInput,
} from "@comatch/shared";
import type { Db } from "../db/client.ts";
import { answerOption, event, optionComplement, participant, question } from "../db/schema.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { randomSlug } from "../lib/tokens.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type EventRow = typeof event.$inferSelect;

function participantCount(db: Db | Tx, eventId: string): Promise<number> {
  return db.$count(participant, and(eq(participant.eventId, eventId), ne(participant.status, "removed")));
}

function toSummary(
  row: Pick<EventRow, "id" | "slug" | "title" | "status" | "startsAt" | "createdAt">,
  count: number,
) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    startsAt: row.startsAt?.toISOString() ?? null,
    participantCount: count,
    createdAt: row.createdAt.toISOString(),
  } satisfies EventSummary;
}

export async function listEvents(db: Db): Promise<EventSummary[]> {
  const rows = await db
    .select({
      id: event.id,
      slug: event.slug,
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      createdAt: event.createdAt,
      participantCount: db.$count(
        participant,
        and(eq(participant.eventId, event.id), ne(participant.status, "removed")),
      ),
    })
    .from(event)
    .orderBy(desc(event.createdAt));
  return rows.map((row) => toSummary(row, row.participantCount));
}

export async function loadQuestions(db: Db | Tx, eventId: string): Promise<QuestionInput[]> {
  const questions = await db
    .select()
    .from(question)
    .where(eq(question.eventId, eventId))
    .orderBy(asc(question.position));
  if (questions.length === 0) return [];

  const options = await db
    .select()
    .from(answerOption)
    .where(
      inArray(
        answerOption.questionId,
        questions.map((q) => q.id),
      ),
    )
    .orderBy(asc(answerOption.position));
  const complements = options.length
    ? await db
        .select()
        .from(optionComplement)
        .where(
          inArray(
            optionComplement.optionId,
            options.map((o) => o.id),
          ),
        )
    : [];

  return questions.map((q) => {
    const own = options.filter((o) => o.questionId === q.id);
    const indexById = new Map(own.map((o, index) => [o.id, index]));
    return {
      text: q.text,
      matchMode: q.matchMode,
      weight: q.weight,
      options: own.map((o) => ({
        label: o.label,
        complements: complements
          .filter((c) => c.optionId === o.id)
          .map((c) => indexById.get(c.complementOptionId))
          .filter((index): index is number => index !== undefined)
          .sort((a, b) => a - b),
      })),
    };
  });
}

export async function getEventDetail(
  db: Db,
  eventId: string,
  publicBaseUrl: string,
  retentionMs: number,
): Promise<EventDetail> {
  const row = await db.query.event.findFirst({ where: eq(event.id, eventId) });
  if (!row) throw notFound("event_not_found");
  const [count, questions] = await Promise.all([participantCount(db, row.id), loadQuestions(db, row.id)]);

  return {
    ...toSummary(row, count),
    language: row.language,
    roundDurationS: row.roundDurationS,
    firstMatchDelayS: row.firstMatchDelayS,
    primaryColor: row.primaryColor,
    logoUrl: row.logoUpdatedAt ? `/api/events/${row.slug}/logo?v=${row.logoUpdatedAt.getTime()}` : null,
    joinUrl: `${publicBaseUrl}/e/${row.slug}`,
    presenterUrl: `${publicBaseUrl}/present/${row.id}?token=${row.presenterToken}`,
    questionsLocked: count > 0,
    questions,
    endedAt: row.endedAt?.toISOString() ?? null,
    purgeAt:
      row.endedAt && !row.purgedAt ? new Date(row.endedAt.getTime() + retentionMs).toISOString() : null,
    purgedAt: row.purgedAt?.toISOString() ?? null,
  };
}

/** Ersetzt alle Fragen eines Events. Nur erlaubt, solange niemand beigetreten ist. */
export async function replaceQuestions(tx: Tx, eventId: string, questions: QuestionInput[]): Promise<void> {
  // Sperrt das Event, damit niemand gleichzeitig mit den alten Antworten beitritt (siehe joinEvent).
  await tx.select({ id: event.id }).from(event).where(eq(event.id, eventId)).for("update");
  if ((await participantCount(tx, eventId)) > 0) {
    throw new HttpError(
      409,
      "questions_locked",
      "Fragen können nicht mehr geändert werden, sobald jemand beigetreten ist.",
    );
  }
  await tx.delete(question).where(eq(question.eventId, eventId));

  for (const [qIndex, raw] of questions.entries()) {
    const q = normalizeComplements(raw);
    const [created] = await tx
      .insert(question)
      .values({ eventId, position: qIndex + 1, text: q.text, matchMode: q.matchMode, weight: q.weight })
      .returning({ id: question.id });

    const options = await tx
      .insert(answerOption)
      .values(
        q.options.map((o, oIndex) => ({ questionId: created!.id, position: oIndex + 1, label: o.label })),
      )
      .returning({ id: answerOption.id, position: answerOption.position });
    options.sort((a, b) => a.position - b.position);

    const pairs = q.options.flatMap((o, oIndex) =>
      o.complements.map((target) => ({
        optionId: options[oIndex]!.id,
        complementOptionId: options[target]!.id,
      })),
    );
    if (pairs.length > 0) await tx.insert(optionComplement).values(pairs);
  }
}

export async function createEvent(
  db: Db,
  input: Omit<EventCreateInput, "language"> & { language?: Language; slug?: string },
  createdBy: string | null,
  questions: QuestionInput[],
): Promise<string> {
  return db.transaction(async (tx) => {
    // Kollisionen sind bei 31^6 Möglichkeiten selten; trotzdem nachprüfen.
    let slug = input.slug ?? randomSlug();
    while (!input.slug && (await tx.$count(event, eq(event.slug, slug))) > 0) slug = randomSlug();

    const [created] = await tx
      .insert(event)
      .values({
        slug,
        title: input.title,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        language: input.language,
        createdBy,
      })
      .returning({ id: event.id });
    await replaceQuestions(tx, created!.id, questions);
    return created!.id;
  });
}
