// Matching-Engine: reine Funktionen ohne Datenbank oder Zeitgeber, damit sie gut testbar bleibt.
export { pairRound, pairUp } from "./pair.ts";
export {
  MIN_REMAINING_MS,
  matchPool,
  type OpenGroup,
  type PoolEntry,
  type PoolInput,
  type PoolResult,
} from "./pool.ts";
export { pairKey, questionMatches, similarity } from "./score.ts";
export type { MatchingContext, MatchPerson, MatchQuestion, PairHistory, PlannedGroup } from "./types.ts";
