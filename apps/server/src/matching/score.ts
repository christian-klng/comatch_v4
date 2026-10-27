import type { MatchingContext, MatchPerson, MatchQuestion, PairHistory } from "./types.ts";

/** Strafe für ein schon getroffenes Paar; deutlich größer als jeder Gewinn an Übereinstimmung. */
export const REPEAT_PENALTY = 10;
/** Höchstwert des Zufallsanteils, der Gleichstände auflöst. */
export const JITTER = 0.05;

/** Reihenfolgeunabhängiger Schlüssel eines Paares (wie pair_history: kleinere ID zuerst). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function questionMatches(q: MatchQuestion, a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (q.matchMode === "same") return a === b;
  // Ergänzend: Ohne jede Zuordnung passt jede andere Antwort, sonst nur zugeordnete Gegenstücke.
  if (q.complements.size === 0) return a !== b;
  return q.complements.get(a)?.has(b) ?? false;
}

/** Gewichtete Übereinstimmung zweier Personen, 0 (nichts passt) bis 1 (alles passt). */
export function similarity(questions: readonly MatchQuestion[], a: MatchPerson, b: MatchPerson): number {
  let total = 0;
  let matched = 0;
  for (const q of questions) {
    total += q.weight;
    if (questionMatches(q, a.answers[q.id], b.answers[q.id])) matched += q.weight;
  }
  return total > 0 ? matched / total : 0;
}

/**
 * Strafe für ein Wiedersehen: 0 für Unbekannte. Bei Wiederholung gilt: je öfter und je kürzer
 * her, desto teurer. So treffen sich bei unvermeidbaren Wiederholungen zuerst die Paare, deren
 * Treffen am längsten zurückliegt.
 */
export function repeatPenalty(history: PairHistory, a: string, b: string, round: number): number {
  const met = history.get(pairKey(a, b));
  if (!met) return 0;
  const roundsAgo = Math.max(1, round - met.lastRound);
  return REPEAT_PENALTY * met.timesMet + 1 / roundsAgo;
}

/** Deterministischer Zufallsgenerator (mulberry32) aus einem Text-Seed. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vorberechnete Paar-Bewertungen für eine Gruppe von Personen. */
export interface ScoreTable {
  similarity(a: string, b: string): number;
  isRepeat(a: string, b: string): boolean;
  /** Ähnlichkeit − Wiederholungsstrafe + Zufall; höher ist besser. */
  score(a: string, b: string): number;
}

export function buildScoreTable(people: readonly MatchPerson[], ctx: MatchingContext): ScoreTable {
  const random = seededRandom(ctx.seed);
  const sims = new Map<string, number>();
  const scores = new Map<string, number>();
  // Feste Reihenfolge, damit derselbe Seed unabhängig von der Eingabereihenfolge gleich würfelt.
  const sorted = [...people].sort((x, y) => (x.id < y.id ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      const key = pairKey(a.id, b.id);
      const sim = similarity(ctx.questions, a, b);
      sims.set(key, sim);
      scores.set(key, sim - repeatPenalty(ctx.history, a.id, b.id, ctx.round) + random() * JITTER);
    }
  }
  return {
    similarity: (a, b) => sims.get(pairKey(a, b)) ?? 0,
    isRepeat: (a, b) => ctx.history.has(pairKey(a, b)),
    score: (a, b) => scores.get(pairKey(a, b)) ?? -Infinity,
  };
}
