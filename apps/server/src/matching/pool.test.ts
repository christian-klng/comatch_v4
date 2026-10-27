import { describe, expect, it } from "vitest";
import type { QuestionInput } from "@comatch/shared";
import { person, questionsFromInput } from "./fixtures.ts";
import { matchPool, type OpenGroup, type PoolInput } from "./pool.ts";
import { pairKey } from "./score.ts";
import type { MatchPerson } from "./types.ts";

const phase: QuestionInput = {
  text: "Phase",
  matchMode: "same",
  weight: 1,
  options: [
    { label: "Idee", complements: [] },
    { label: "Seed", complements: [] },
  ],
};

const NOW = 1_000_000;
const DELAY = 30_000;

function input(overrides: Partial<PoolInput>): PoolInput {
  return {
    questions: questionsFromInput([phase]),
    history: new Map(),
    round: 2,
    seed: "pool",
    waiting: [],
    openGroups: [],
    now: NOW,
    roundEndsAt: NOW + 4 * 60_000,
    firstMatchDelayMs: DELAY,
    ...overrides,
  };
}

const waitingSince = (p: MatchPerson, msAgo: number) => ({ person: p, poolSince: NOW - msAgo });
const group = (id: string, ...members: MatchPerson[]): OpenGroup => ({ id, members });

describe("matchPool", () => {
  it("paart zwei Wartende sofort, ohne die Wartezeit abzuwarten", () => {
    const result = matchPool(
      input({ waiting: [waitingSince(person("a", [0]), 1000), waitingSince(person("b", [1]), 500)] }),
    );
    expect(result.newGroups.map((g) => g.members.sort())).toEqual([["a", "b"]]);
    expect(result.waiting).toEqual([]);
  });

  it("lässt eine einzelne Person warten, bis die Wartezeit um ist", () => {
    const result = matchPool(
      input({
        waiting: [waitingSince(person("a", [0]), DELAY - 1)],
        openGroups: [group("g1", person("x", [0]), person("y", [0]))],
      }),
    );
    expect(result).toMatchObject({ newGroups: [], joins: [], waiting: ["a"], waitForNextRound: false });
  });

  it("setzt eine Person nach der Wartezeit in das passendste offene Match", () => {
    const result = matchPool(
      input({
        waiting: [waitingSince(person("a", [0]), DELAY)],
        openGroups: [
          group("seed", person("s1", [1]), person("s2", [1])),
          group("idee", person("i1", [0]), person("i2", [0])),
        ],
      }),
    );
    expect(result.joins).toEqual([
      { groupId: "idee", group: { members: ["i1", "i2", "a"], similarity: 1, repeats: 0 } },
    ]);
    expect(result.waiting).toEqual([]);
  });

  it("lässt die Person warten, wenn es kein offenes Match gibt", () => {
    const result = matchPool(input({ waiting: [waitingSince(person("a", [0]), 2 * DELAY)] }));
    expect(result.waiting).toEqual(["a"]);
  });

  it("ignoriert Gruppen, die schon zu dritt sind", () => {
    const full = group("voll", person("x", [0]), person("y", [0]), person("z", [0]));
    const result = matchPool(input({ waiting: [waitingSince(person("a", [0]), DELAY)], openGroups: [full] }));
    expect(result.joins).toEqual([]);
  });

  it("paart bei drei Wartenden die beiden, die am längsten warten", () => {
    const result = matchPool(
      input({
        waiting: [
          waitingSince(person("neu", [0]), 1000),
          waitingSince(person("alt1", [1]), 20_000),
          waitingSince(person("alt2", [1]), 15_000),
        ],
      }),
    );
    expect(result.newGroups.map((g) => g.members.sort())).toEqual([["alt1", "alt2"]]);
    expect(result.waiting).toEqual(["neu"]);
  });

  it("paart niemanden, der sich schon getroffen hat (z. B. nach „Nicht gefunden“)", () => {
    const history = new Map([[pairKey("a", "b"), { timesMet: 1, lastRound: 2 }]]);
    const result = matchPool(
      input({
        history,
        waiting: [waitingSince(person("a", [0]), DELAY), waitingSince(person("b", [0]), DELAY + 1)],
        openGroups: [
          group("g1", person("x", [0]), person("y", [0])),
          group("g2", person("v", [1]), person("w", [1])),
        ],
      }),
    );
    expect(result.newGroups).toEqual([]);
    // b wartet länger und bekommt das passendere Match.
    expect(result.joins.map((j) => [j.groupId, j.group.members.at(-1)])).toEqual([
      ["g1", "b"],
      ["g2", "a"],
    ]);
  });

  it("matcht kurz vor Rundenende niemanden mehr", () => {
    const result = matchPool(
      input({
        roundEndsAt: NOW + 59_000,
        waiting: [waitingSince(person("a", [0]), DELAY), waitingSince(person("b", [0]), DELAY)],
      }),
    );
    expect(result).toEqual({ newGroups: [], joins: [], waiting: ["a", "b"], waitForNextRound: true });
  });
});
