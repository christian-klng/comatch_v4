import { describe, expect, it } from "vitest";
import { DEFAULT_QUESTIONS, type QuestionInput } from "@comatch/shared";
import { person, questionsFromInput, randomPeople, recordRound } from "./fixtures.ts";
import { EXACT_LIMIT, pairRound } from "./pair.ts";
import { pairKey } from "./score.ts";
import type { MatchingContext, MatchPerson } from "./types.ts";

const opts = (...labels: string[]) => labels.map((label) => ({ label, complements: [] }));
const phase: QuestionInput = { text: "Phase", matchMode: "same", weight: 1, options: opts("Idee", "Seed") };

function ctx(questions: QuestionInput[], overrides: Partial<MatchingContext> = {}): MatchingContext {
  return {
    questions: questionsFromInput(questions),
    history: new Map(),
    round: 1,
    seed: "test",
    ...overrides,
  };
}

const sortedGroups = (groups: { members: string[] }[]) =>
  groups.map((g) => [...g.members].sort().join("+")).sort();

/** Jede Person genau einmal, Gruppen mit 2 oder 3 Personen, höchstens eine Dreiergruppe. */
function expectValidPartition(people: MatchPerson[], groups: { members: string[] }[]) {
  const seen = groups.flatMap((g) => g.members);
  expect([...seen].sort()).toEqual(people.map((p) => p.id).sort());
  expect(groups.every((g) => g.members.length === 2 || g.members.length === 3)).toBe(true);
  expect(groups.filter((g) => g.members.length === 3).length).toBe(people.length % 2);
}

/** Spielt mehrere Runden durch und zählt wiederholte Paare je Runde. */
function playRounds(people: MatchPerson[], questions: QuestionInput[], rounds: number) {
  const history = new Map<string, { timesMet: number; lastRound: number }>();
  const repeatsPerRound: number[] = [];
  for (let round = 1; round <= rounds; round++) {
    const { groups } = pairRound(people, ctx(questions, { history, round, seed: `sim:${round}` }));
    expectValidPartition(people, groups);
    repeatsPerRound.push(groups.reduce((sum, g) => sum + g.repeats, 0));
    recordRound(history, groups, round);
  }
  return { repeatsPerRound, history };
}

describe("pairRound", () => {
  it("lässt eine einzelne Person ohne Match", () => {
    expect(pairRound([], ctx([phase]))).toEqual({ groups: [], unmatched: [] });
    expect(pairRound([person("a", [0])], ctx([phase]))).toEqual({ groups: [], unmatched: ["a"] });
  });

  it("macht aus zwei Personen ein Paar und aus drei eine Dreiergruppe", () => {
    expect(pairRound([person("a", [0]), person("b", [1])], ctx([phase])).groups).toEqual([
      { members: expect.arrayContaining(["a", "b"]), similarity: 0, repeats: 0 },
    ]);
    const { groups } = pairRound([person("a", [0]), person("b", [0]), person("c", [1])], ctx([phase]));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.sort()).toEqual(["a", "b", "c"]);
    expect(groups[0]!.similarity).toBeCloseTo(1 / 3);
  });

  it("bringt gleiche Antworten zusammen", () => {
    const people = [person("a", [0]), person("b", [1]), person("c", [0]), person("d", [1])];
    const { groups } = pairRound(people, ctx([phase]));
    expect(sortedGroups(groups)).toEqual(["a+c", "b+d"]);
    expect(groups.every((g) => g.similarity === 1)).toBe(true);
  });

  it("bringt im Modus „ergänzend“ Gegenstücke zusammen", () => {
    const role: QuestionInput = {
      text: "Rolle",
      matchMode: "complementary",
      weight: 1,
      options: [
        { label: "Tech", complements: [1] },
        { label: "Business", complements: [0] },
      ],
    };
    const people = [person("t1", [0]), person("t2", [0]), person("b1", [1]), person("b2", [1])];
    const { groups } = pairRound(people, ctx([role]));
    expect(groups.every((g) => g.similarity === 1)).toBe(true);
    expect(
      groups.every(
        (g) => g.members.some((m) => m.startsWith("t")) && g.members.some((m) => m.startsWith("b")),
      ),
    ).toBe(true);
  });

  it("stellt wichtigere Fragen vor weniger wichtige", () => {
    const important: QuestionInput = { ...phase, weight: 3 };
    const minor: QuestionInput = { ...phase, text: "Branche", weight: 1 };
    // a und b stimmen in der wichtigen Frage überein, a und c nur in der unwichtigen.
    const people = [person("a", [0, 0]), person("b", [0, 1]), person("c", [1, 0]), person("d", [1, 1])];
    const { groups } = pairRound(people, ctx([important, minor]));
    expect(sortedGroups(groups)).toEqual(["a+b", "c+d"]);
  });

  it("vermeidet Wiedersehen, auch wenn die Antworten besser passen würden", () => {
    const people = [person("a", [0]), person("b", [1]), person("c", [0]), person("d", [1])];
    const history = new Map([
      [pairKey("a", "c"), { timesMet: 1, lastRound: 1 }],
      [pairKey("b", "d"), { timesMet: 1, lastRound: 1 }],
    ]);
    const { groups } = pairRound(people, ctx([phase], { history, round: 2 }));
    expect(groups.every((g) => g.repeats === 0)).toBe(true);
  });

  it("wählt bei unvermeidbaren Wiederholungen das Treffen, das am längsten her ist", () => {
    const people = [person("a", [0]), person("b", [0]), person("c", [0]), person("d", [0])];
    // Alle kennen sich; a+b/c+d zuletzt in Runde 1, die anderen Kombinationen in Runde 2 und 3.
    const history = new Map([
      [pairKey("a", "b"), { timesMet: 1, lastRound: 1 }],
      [pairKey("c", "d"), { timesMet: 1, lastRound: 1 }],
      [pairKey("a", "c"), { timesMet: 1, lastRound: 2 }],
      [pairKey("b", "d"), { timesMet: 1, lastRound: 2 }],
      [pairKey("a", "d"), { timesMet: 1, lastRound: 3 }],
      [pairKey("b", "c"), { timesMet: 1, lastRound: 3 }],
    ]);
    const { groups } = pairRound(people, ctx([phase], { history, round: 4 }));
    expect(sortedGroups(groups)).toEqual(["a+b", "c+d"]);
  });

  it("ist für denselben Seed reproduzierbar, unabhängig von der Reihenfolge", () => {
    const people = randomPeople(30, DEFAULT_QUESTIONS, "det");
    const first = pairRound(people, ctx(DEFAULT_QUESTIONS));
    const shuffled = pairRound([...people].reverse(), ctx(DEFAULT_QUESTIONS));
    expect(sortedGroups(shuffled.groups)).toEqual(sortedGroups(first.groups));
  });

  it.each([2, 3, 5, 8, 13, 14, 15, 41, 100])("teilt %i Personen vollständig auf", (count) => {
    const people = randomPeople(count, DEFAULT_QUESTIONS, `n${count}`);
    expectValidPartition(people, pairRound(people, ctx(DEFAULT_QUESTIONS)).groups);
  });

  it("schafft in kleinen Events so viele Runden ohne Wiederholung wie möglich", () => {
    // Bei 6 bzw. 10 Personen gibt es genau 5 bzw. 9 Runden, in denen alle neue Leute treffen.
    expect(
      playRounds(randomPeople(6, DEFAULT_QUESTIONS, "s6"), DEFAULT_QUESTIONS, 5).repeatsPerRound,
    ).toEqual([0, 0, 0, 0, 0]);
    const ten = playRounds(randomPeople(10, DEFAULT_QUESTIONS, "s10"), DEFAULT_QUESTIONS, 9);
    expect(ten.repeatsPerRound.every((r) => r === 0)).toBe(true);
  });

  it("verteilt in großen Events 10 Runden ohne Wiederholung", () => {
    for (const count of [EXACT_LIMIT + 1, 20, 21, 51, 100]) {
      const { repeatsPerRound } = playRounds(
        randomPeople(count, DEFAULT_QUESTIONS, `big${count}`),
        DEFAULT_QUESTIONS,
        10,
      );
      expect(
        repeatsPerRound.reduce((a, b) => a + b, 0),
        `${count} Personen`,
      ).toBe(0);
    }
  });

  it.each([EXACT_LIMIT, 100])("paart %i Personen schnell genug", (count) => {
    // 13 ist der teuerste Fall der exakten Suche; die Grenze lässt CI-Rechnern viel Luft.
    const people = randomPeople(count, DEFAULT_QUESTIONS, "perf");
    const start = performance.now();
    pairRound(people, ctx(DEFAULT_QUESTIONS));
    expect(performance.now() - start).toBeLessThan(500);
  });
});
