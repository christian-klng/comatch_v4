import { asc, eq } from "drizzle-orm";
import { answerOption, event, participant, participantAnswer, question } from "../src/db/schema.ts";
import { randomToken, sha256 } from "../src/lib/tokens.ts";
import type { useTestApp } from "./helpers.ts";

/** Hilfen für Tests der Live-Laufzeit. */
export function liveHelpers(t: ReturnType<typeof useTestApp>) {
  /** Legt fertig angemeldete, verbundene Personen an (Antworten reihum, Selfie vorhanden). */
  async function addReady(eventId: string, count: number, { connect = true } = {}) {
    const questions = await t.db
      .select()
      .from(question)
      .where(eq(question.eventId, eventId))
      .orderBy(asc(question.position));
    const options = await t.db.select().from(answerOption).orderBy(asc(answerOption.position));
    const people: { id: string; token: string }[] = [];
    for (let i = 0; i < count; i++) {
      const token = randomToken();
      const [row] = await t.db
        .insert(participant)
        .values({
          eventId,
          sessionTokenHash: sha256(token),
          status: "pool",
          poolSince: new Date(t.clock.now()),
          lastSeenAt: new Date(t.clock.now()),
          selfieKey: `events/${eventId}/selfies/${i}/a.jpg`,
          consentAt: new Date(),
        })
        .returning({ id: participant.id });
      await t.db.insert(participantAnswer).values(
        questions.map((q) => {
          const own = options.filter((o) => o.questionId === q.id);
          return {
            participantId: row!.id,
            questionId: q.id,
            answerOptionId: own[(i + people.length) % own.length]!.id,
          };
        }),
      );
      if (connect) await t.live.connect(row!.id, eventId);
      people.push({ id: row!.id, token });
    }
    await t.live.idle();
    return people;
  }

  async function eventRow(id: string) {
    const [row] = await t.db.select().from(event).where(eq(event.id, id));
    return row!;
  }

  async function statusOf(id: string) {
    const [row] = await t.db
      .select({ status: participant.status })
      .from(participant)
      .where(eq(participant.id, id));
    return row?.status;
  }

  return { addReady, eventRow, statusOf };
}
