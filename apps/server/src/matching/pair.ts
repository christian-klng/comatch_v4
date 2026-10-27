import { buildScoreTable, type ScoreTable } from "./score.ts";
import type { MatchingContext, MatchPerson, PlannedGroup } from "./types.ts";

const MAX_IMPROVEMENT_PASSES = 20;
const EPSILON = 1e-9;

/**
 * Paart Personen so, dass die Summe der Scores möglichst hoch ist: erst greedy (beste Paare
 * zuerst), dann lokale Verbesserung durch Partnertausch zwischen je zwei Paaren.
 * Bei ungerader Anzahl bleibt genau eine Person übrig.
 */
export function pairUp(
  ids: readonly string[],
  table: ScoreTable,
): { pairs: [string, string][]; leftover: string | null } {
  const candidates: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      candidates.push({ a: ids[i]!, b: ids[j]!, score: table.score(ids[i]!, ids[j]!) });
    }
  }
  candidates.sort((x, y) => y.score - x.score);

  const taken = new Set<string>();
  const pairs: [string, string][] = [];
  for (const { a, b } of candidates) {
    if (taken.has(a) || taken.has(b)) continue;
    taken.add(a).add(b);
    pairs.push([a, b]);
  }
  const leftover = ids.find((id) => !taken.has(id)) ?? null;

  // 2-opt: Für je zwei Paare (a,b) und (c,d) prüfen, ob (a,c)+(b,d) oder (a,d)+(b,c) besser wäre.
  for (let pass = 0; pass < MAX_IMPROVEMENT_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [a, b] = pairs[i]!;
        const [c, d] = pairs[j]!;
        const current = table.score(a, b) + table.score(c, d);
        const swapAC = table.score(a, c) + table.score(b, d);
        const swapAD = table.score(a, d) + table.score(b, c);
        if (swapAC > current + EPSILON && swapAC >= swapAD) {
          pairs[i] = [a, c];
          pairs[j] = [b, d];
          improved = true;
        } else if (swapAD > current + EPSILON) {
          pairs[i] = [a, d];
          pairs[j] = [b, c];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  resolveRepeats(pairs, table);
  return { pairs, leftover };
}

/**
 * Gezielter Dreifach-Tausch: Jedes Paar, das sich schon kennt, wird mit je zwei anderen Paaren
 * exakt neu aufgeteilt (15 Möglichkeiten). Findet Lösungen, die der Paartausch übersieht.
 */
function resolveRepeats(pairs: [string, string][], table: ScoreTable) {
  for (let pass = 0; pass < MAX_IMPROVEMENT_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < pairs.length; i++) {
      if (!table.isRepeat(...pairs[i]!)) continue;
      search: for (let j = 0; j < pairs.length; j++) {
        for (let k = j + 1; k < pairs.length; k++) {
          if (j === i || k === i) continue;
          const trio = [pairs[i]!, pairs[j]!, pairs[k]!];
          const current = trio.reduce((sum, [a, b]) => sum + table.score(a, b), 0);
          const better = exactGroups(trio.flat(), table) as [string, string][];
          const value = better.reduce((sum, [a, b]) => sum + table.score(a, b), 0);
          if (value > current + EPSILON) {
            [pairs[i], pairs[j], pairs[k]] = better as [[string, string], [string, string], [string, string]];
            improved = true;
            break search;
          }
        }
      }
    }
    if (!improved) break;
  }
}

/** Übereinstimmung und Wiederholungen einer geplanten Gruppe (Mittelwert über alle Paare). */
export function describeGroup(members: string[], table: ScoreTable): PlannedGroup {
  let sum = 0;
  let count = 0;
  let repeats = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      sum += table.similarity(members[i]!, members[j]!);
      if (table.isRepeat(members[i]!, members[j]!)) repeats++;
      count++;
    }
  }
  return { members, similarity: count > 0 ? sum / count : 0, repeats };
}

/** Mittlerer Score, wenn `id` zu einer bestehenden Gruppe dazukommt. */
export function joinScore(id: string, members: readonly string[], table: ScoreTable): number {
  return members.reduce((sum, m) => sum + table.score(id, m), 0) / members.length;
}

/** Bis zu dieser Größe werden alle Aufteilungen durchprobiert (13 Personen: ca. 270 000). */
export const EXACT_LIMIT = 13;

/** Wert einer Gruppe: Summe der Paar-Scores; eine Dreiergruppe zählt wie anderthalb Paare. */
function groupValue(members: readonly string[], table: ScoreTable): number {
  if (members.length === 2) return table.score(members[0]!, members[1]!);
  const [a, b, c] = members as [string, string, string];
  return ((table.score(a, b) + table.score(a, c) + table.score(b, c)) / 3) * 1.5;
}

/**
 * Exakte Aufteilung in Paare (bei ungerader Anzahl plus eine Dreiergruppe) mit maximaler
 * Summe. Für kleine Events, in denen Greedy schneller in unnötige Wiederholungen läuft.
 */
export function exactGroups(ids: readonly string[], table: ScoreTable): string[][] {
  const n = ids.length;
  const free = new Array<boolean>(n).fill(true);
  const current: string[][] = [];
  let best: string[][] = [];
  let bestValue = -Infinity;

  const search = (value: number, tripleUsed: boolean) => {
    const i = free.indexOf(true);
    if (i === -1) {
      if (value > bestValue) {
        bestValue = value;
        best = current.map((g) => [...g]);
      }
      return;
    }
    free[i] = false;
    for (let j = i + 1; j < n; j++) {
      if (!free[j]) continue;
      free[j] = false;
      const pair = [ids[i]!, ids[j]!];
      current.push(pair);
      search(value + groupValue(pair, table), tripleUsed);
      current.pop();
      // Bei ungerader Anzahl genau eine Dreiergruppe.
      if (n % 2 === 1 && !tripleUsed) {
        for (let k = j + 1; k < n; k++) {
          if (!free[k]) continue;
          free[k] = false;
          const triple = [ids[i]!, ids[j]!, ids[k]!];
          current.push(triple);
          search(value + groupValue(triple, table), true);
          current.pop();
          free[k] = true;
        }
      }
      free[j] = true;
    }
    free[i] = true;
  };

  search(0, false);
  return best;
}

/** Tauscht Mitglieder der Dreiergruppe mit Personen aus Paaren, solange sich der Gesamtwert verbessert. */
function improveTriple(groups: string[][], triple: string[], table: ScoreTable) {
  for (let pass = 0; pass < MAX_IMPROVEMENT_PASSES; pass++) {
    let improved = false;
    for (const pair of groups) {
      if (pair === triple) continue;
      for (let t = 0; t < 3; t++) {
        for (let p = 0; p < 2; p++) {
          const newTriple = triple.map((m, i) => (i === t ? pair[p]! : m));
          const newPair = [triple[t]!, pair[1 - p]!];
          const before = groupValue(triple, table) + groupValue(pair, table);
          const after = groupValue(newTriple, table) + groupValue(newPair, table);
          if (after > before + EPSILON) {
            triple.splice(0, 3, ...newTriple);
            pair.splice(0, 2, ...newPair);
            improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }
}

/**
 * Paarung beim Rundenwechsel: alle übergebenen (aktiven) Personen bekommen eine Gruppe.
 * Bei ungerader Anzahl kommt die übrige Person in die Gruppe, zu der sie am besten passt.
 * Eine einzelne Person bleibt ohne Match.
 */
export function pairRound(
  people: readonly MatchPerson[],
  ctx: MatchingContext,
): { groups: PlannedGroup[]; unmatched: string[] } {
  if (people.length < 2) return { groups: [], unmatched: people.map((p) => p.id) };

  const table = buildScoreTable(people, ctx);
  const ids = people.map((p) => p.id);
  let groups: string[][];

  if (ids.length <= EXACT_LIMIT) {
    groups = exactGroups(ids, table);
  } else {
    const { pairs, leftover } = pairUp(ids, table);
    groups = pairs.map((pair) => [...pair]);
    if (leftover) {
      let best = groups[0]!;
      for (const group of groups) {
        if (joinScore(leftover, group, table) > joinScore(leftover, best, table)) best = group;
      }
      best.push(leftover);
      improveTriple(groups, best, table);
    }
  }

  return { groups: groups.map((members) => describeGroup(members, table)), unmatched: [] };
}
