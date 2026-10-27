import { describeGroup, joinScore, pairUp } from "./pair.ts";
import { buildScoreTable } from "./score.ts";
import type { MatchingContext, MatchPerson, PlannedGroup } from "./types.ts";

/** Kurz vor Rundenende lohnt kein neues Match mehr; die Person wartet auf die nächste Runde. */
export const MIN_REMAINING_MS = 60_000;

export interface PoolEntry {
  person: MatchPerson;
  /** Zeitpunkt (ms), seit dem die Person auf ein Match wartet. */
  poolSince: number;
}

/** Ein Match dieser Runde, das noch niemand bestätigt hat und noch Platz hat (2 Personen). */
export interface OpenGroup {
  id: string;
  members: MatchPerson[];
}

export interface PoolInput extends MatchingContext {
  waiting: readonly PoolEntry[];
  openGroups: readonly OpenGroup[];
  now: number;
  roundEndsAt: number;
  /** Wartezeit, nach der eine einzelne Person in ein bestehendes Match kommt (Standard 30 s). */
  firstMatchDelayMs: number;
}

export interface PoolResult {
  /** Neue Paare aus wartenden Personen. */
  newGroups: PlannedGroup[];
  /** Personen, die als Dritte zu einem offenen Match kommen. */
  joins: { groupId: string; group: PlannedGroup }[];
  /** Wer weiter wartet. */
  waiting: string[];
  /** true, wenn die Runde fast vorbei ist und alle Wartenden in die nächste Runde gehen. */
  waitForNextRound: boolean;
}

/**
 * Schnellmatch für Personen, die während einer Runde dazukommen (läuft alle paar Sekunden):
 * 1. Wartende werden sofort miteinander gepaart, sobald mindestens zwei da sind.
 *    Paare, die sich schon getroffen haben, entstehen im Pool nicht.
 * 2. Wer übrig bleibt (bei ungerader Anzahl die zuletzt gekommene Person) und lange genug wartet,
 *    kommt als Dritte in das offene Match, zu dem sie am besten passt (je Match höchstens eine).
 * 3. Sonst wartet die Person weiter (notfalls bis zur nächsten Runde).
 */
export function matchPool(input: PoolInput): PoolResult {
  const waitingIds = input.waiting.map((w) => w.person.id);
  if (input.roundEndsAt - input.now < MIN_REMAINING_MS) {
    return { newGroups: [], joins: [], waiting: waitingIds, waitForNextRound: true };
  }

  const byArrival = [...input.waiting].sort((a, b) => a.poolSince - b.poolSince);
  // Bei ungerader Anzahl bleibt die zuletzt gekommene Person übrig, die kürzer wartet als alle anderen.
  if (byArrival.length % 2 === 1) byArrival.pop();

  const everyone = [...input.waiting.map((w) => w.person), ...input.openGroups.flatMap((g) => g.members)];
  const table = buildScoreTable(everyone, input);

  const { pairs } = pairUp(
    byArrival.map((w) => w.person.id),
    table,
  );
  // Im Pool keine Wiederholungen: Wer sich schon getroffen hat (z. B. nach „Nicht gefunden“),
  // wartet einzeln weiter oder kommt in ein anderes Match.
  const fresh = pairs.filter(([a, b]) => !table.isRepeat(a, b));
  const newGroups = fresh.map((pair) => describeGroup([...pair], table));

  const paired = new Set(fresh.flat());
  // Wer am längsten wartet, sucht sich zuerst ein offenes Match aus.
  const singles = [...input.waiting]
    .sort((a, b) => a.poolSince - b.poolSince)
    .filter((w) => !paired.has(w.person.id));
  const freeGroups = input.openGroups.filter((g) => g.members.length === 2);
  const joins: PoolResult["joins"] = [];
  const stillWaiting: string[] = [];

  for (const single of singles) {
    const id = single.person.id;
    const due = input.now - single.poolSince >= input.firstMatchDelayMs;
    let best = -1;
    let bestScore = -Infinity;
    if (due) {
      freeGroups.forEach((group, index) => {
        const score = joinScore(
          id,
          group.members.map((m) => m.id),
          table,
        );
        if (score > bestScore) {
          best = index;
          bestScore = score;
        }
      });
    }
    if (best >= 0) {
      const [group] = freeGroups.splice(best, 1);
      joins.push({
        groupId: group!.id,
        group: describeGroup([...group!.members.map((m) => m.id), id], table),
      });
    } else {
      stillWaiting.push(id);
    }
  }

  return { newGroups, joins, waiting: stillWaiting, waitForNextRound: false };
}
