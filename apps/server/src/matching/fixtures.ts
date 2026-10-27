import { normalizeComplements, type QuestionInput } from "@comatch/shared";
import { pairKey, seededRandom } from "./score.ts";
import type { MatchPerson, MatchQuestion, PairHistory } from "./types.ts";

// Hilfen für Tests und das Simulations-Skript (nicht für den Produktivcode).

/** Wandelt Fragen aus dem Editor (Optionen per Index) in Engine-Fragen mit IDs `q1`, `q1o2` … um. */
export function questionsFromInput(inputs: readonly QuestionInput[]): MatchQuestion[] {
  return inputs.map((raw, qi) => {
    const q = normalizeComplements(raw);
    const id = `q${qi + 1}`;
    const optionId = (oi: number) => `${id}o${oi + 1}`;
    const complements = new Map<string, Set<string>>();
    q.options.forEach((o, oi) => {
      if (o.complements.length > 0) complements.set(optionId(oi), new Set(o.complements.map(optionId)));
    });
    return { id, matchMode: q.matchMode, weight: q.weight, complements };
  });
}

/** Person mit Antworten als Options-Index je Frage, z. B. person("p1", [0, 2, 1]). */
export function person(id: string, optionIndexes: readonly number[]): MatchPerson {
  return {
    id,
    answers: Object.fromEntries(optionIndexes.map((oi, qi) => [`q${qi + 1}`, `q${qi + 1}o${oi + 1}`])),
  };
}

/** Zufällige Teilnehmende p1…pN mit zufälligen Antworten. */
export function randomPeople(
  count: number,
  questions: readonly QuestionInput[],
  seed: string,
): MatchPerson[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, i) =>
    person(
      `p${String(i + 1).padStart(3, "0")}`,
      questions.map((q) => Math.floor(random() * q.options.length)),
    ),
  );
}

/** Trägt die Paare einer Runde in die Historie ein (wie später pair_history). */
export function recordRound(
  history: Map<string, { timesMet: number; lastRound: number }>,
  groups: readonly { members: readonly string[] }[],
  round: number,
): PairHistory {
  for (const { members } of groups) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = pairKey(members[i]!, members[j]!);
        const met = history.get(key);
        history.set(key, { timesMet: (met?.timesMet ?? 0) + 1, lastRound: round });
      }
    }
  }
  return history;
}
