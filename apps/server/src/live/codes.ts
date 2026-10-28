import { randomInt } from "node:crypto";
import { CODE_LENGTH } from "@comatch/shared";
import { seededRandom } from "../matching/score.ts";

export interface CodeState {
  ownCode: string;
  /** Wessen Code diese Person auswählen muss (Ring A→B→C→A, bei Paaren gegenseitig). */
  confirmsParticipantId: string;
  /** Zwei Köder, die neben dem richtigen Code zur Auswahl stehen. */
  decoyCodes: string[];
}

export interface MemberCode extends CodeState {
  participantId: string;
  /** Ziel und Köder sind unverändert: Bestätigung und Fehlversuche bleiben gültig. */
  kept: boolean;
}

/** Zufallszahl aus [min, max); in Tests austauschbar. */
export type RandomInt = (min: number, max: number) => number;

const DECOYS = 2;

const isValid = (code: string) =>
  code.length === CODE_LENGTH && code[0] !== "0" && new Set(code).size === CODE_LENGTH;

/** Dreistellige Zahl mit verschiedenen Ziffern, ohne führende Null: gut ansagbar, schwer zu verwechseln. */
function randomCode(rng: RandomInt): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += String(rng(i === 0 ? 1 : 0, 10));
    if (isValid(code)) return code;
  }
}

function permutations(code: string): string[] {
  if (code.length <= 1) return [code];
  return [...code].flatMap((c, i) =>
    permutations(code.slice(0, i) + code.slice(i + 1)).map((rest) => c + rest),
  );
}

/** Codes, die sich in genau einer Ziffer unterscheiden. */
function oneDigitOff(code: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < code.length; i++) {
    for (let d = 0; d <= 9; d++) result.push(code.slice(0, i) + String(d) + code.slice(i + 1));
  }
  return result;
}

/**
 * Plausible Köder zum Code des Gegenübers: einer mit vertauschten Ziffern, einer mit einer
 * anderen Ziffer. Wer nur flüchtig hinschaut, liegt so leicht daneben.
 */
export function makeDecoys(target: string, taken: ReadonlySet<string>, rng: RandomInt = randomInt): string[] {
  const free = (c: string) => isValid(c) && c !== target && !taken.has(c);
  const pools = [permutations(target).filter(free), oneDigitOff(target).filter(free)];
  const decoys: string[] = [];
  for (const pool of pools) {
    const options = pool.filter((c) => !decoys.includes(c));
    if (options.length > 0) decoys.push(options[rng(0, options.length)]!);
  }
  while (decoys.length < DECOYS) {
    const code = randomCode(rng);
    if (free(code) && !decoys.includes(code)) decoys.push(code);
  }
  return decoys;
}

/**
 * Reihenfolge für den Ring: Wer schon in der Gruppe war, behält seinen Platz (A→B bleibt A→B),
 * Neue kommen hinten dazu. So müssen möglichst wenige Personen neu bestätigen.
 */
function ringOrder(memberIds: readonly string[], existing: ReadonlyMap<string, CodeState>): string[] {
  const present = new Set(memberIds);
  const order: string[] = [];
  let current = memberIds.find((id) => existing.has(id));
  while (current && present.has(current) && !order.includes(current)) {
    order.push(current);
    current = existing.get(current)?.confirmsParticipantId;
  }
  return [...order, ...memberIds.filter((id) => !order.includes(id))];
}

/**
 * Vergibt je Person einen Code (innerhalb der Gruppe verschieden), das Ziel im Ring und die
 * Köder. Bestehende Codes bleiben erhalten, wenn sich die Gruppe ändert.
 */
export function assignCodes(
  memberIds: readonly string[],
  existing: ReadonlyMap<string, CodeState> = new Map(),
  rng: RandomInt = randomInt,
): MemberCode[] {
  const order = ringOrder(memberIds, existing);
  const codes = new Map<string, string>();
  for (const id of order) {
    const code = existing.get(id)?.ownCode;
    if (code && ![...codes.values()].includes(code)) codes.set(id, code);
  }
  // Neue Codes nicht unter den Ködern der Bleibenden wählen, damit deren Auswahl gültig bleibt.
  const avoid = new Set(order.flatMap((id) => existing.get(id)?.decoyCodes ?? []));
  for (const id of order) {
    if (codes.has(id)) continue;
    let code = randomCode(rng);
    while ([...codes.values()].includes(code) || avoid.has(code)) code = randomCode(rng);
    codes.set(id, code);
  }

  const groupCodes = new Set(codes.values());
  return order.map((id, i) => {
    const target = order[(i + 1) % order.length]!;
    const previous = existing.get(id);
    const kept =
      previous?.confirmsParticipantId === target &&
      previous.ownCode === codes.get(id) &&
      previous.decoyCodes.length === DECOYS &&
      previous.decoyCodes.every((c) => !groupCodes.has(c));
    return {
      participantId: id,
      ownCode: codes.get(id)!,
      confirmsParticipantId: target,
      decoyCodes: kept ? previous.decoyCodes : makeDecoys(codes.get(target)!, groupCodes, rng),
      kept,
    };
  });
}

function shuffle<T>(items: readonly T[], seed: string): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Die drei Codes zur Auswahl. Die Reihenfolge ist stabil (Neuladen verrät nichts) und ändert
 * sich nach jeder falschen Auswahl.
 */
export function codeOptions(
  groupId: string,
  participantId: string,
  targetCode: string,
  decoys: readonly string[],
  wrongAttempts: number,
): string[] {
  const codes = [targetCode, ...decoys];
  let options = shuffle(codes, `${groupId}:${participantId}:0`);
  for (let n = 1; n <= wrongAttempts; n++) {
    const next = shuffle(codes, `${groupId}:${participantId}:${n}`);
    if (next.join() === options.join()) next.push(next.shift()!);
    options = next;
  }
  return options;
}
