import type { MatchMode } from "@comatch/shared";

/** Eine Frage, wie die Engine sie braucht. */
export interface MatchQuestion {
  id: string;
  matchMode: MatchMode;
  weight: number;
  /** Gegen-Optionen je Option (symmetrisch). Leer: im Modus „ergänzend“ passt jede andere Antwort. */
  complements: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface MatchPerson {
  id: string;
  /** Gewählte Option je Frage: questionId → optionId */
  answers: Readonly<Record<string, string>>;
}

/** Wer wen schon getroffen hat; Schlüssel aus pairKey(). */
export type PairHistory = ReadonlyMap<string, { timesMet: number; lastRound: number }>;

export interface PlannedGroup {
  /** 2 Personen, bei ungerader Anzahl auch 3. */
  members: string[];
  /** Mittlere Übereinstimmung der Paare in der Gruppe, 0–1. */
  similarity: number;
  /** Anzahl der Paare in der Gruppe, die sich schon getroffen haben. */
  repeats: number;
}

export interface MatchingContext {
  questions: readonly MatchQuestion[];
  history: PairHistory;
  /** Nummer der Runde, für die gepaart wird (für den Abstand zu früheren Treffen). */
  round: number;
  /** Macht den Zufallsanteil reproduzierbar, z. B. `${eventId}:${round}`. */
  seed: string;
}
