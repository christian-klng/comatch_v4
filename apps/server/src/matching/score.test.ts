import { describe, expect, it } from "vitest";
import type { QuestionInput } from "@comatch/shared";
import { person, questionsFromInput } from "./fixtures.ts";
import { pairKey, repeatPenalty, seededRandom, similarity } from "./score.ts";

const opts = (...labels: string[]) => labels.map((label) => ({ label, complements: [] }));
const same = (weight = 1): QuestionInput => ({
  text: "Phase",
  matchMode: "same",
  weight,
  options: opts("A", "B", "C"),
});

describe("similarity", () => {
  it("zählt im Modus „gleich“ identische Antworten", () => {
    const qs = questionsFromInput([same(), same(), same()]);
    expect(similarity(qs, person("a", [0, 1, 2]), person("b", [0, 1, 2]))).toBe(1);
    expect(similarity(qs, person("a", [0, 1, 2]), person("b", [0, 0, 0]))).toBeCloseTo(1 / 3);
    expect(similarity(qs, person("a", [0, 1, 2]), person("b", [1, 2, 0]))).toBe(0);
  });

  it("wertet im Modus „ergänzend“ ohne Zuordnung jede andere Antwort als passend", () => {
    const qs = questionsFromInput([
      { text: "Rolle", matchMode: "complementary", weight: 1, options: opts("Tech", "Business", "Design") },
    ]);
    expect(similarity(qs, person("a", [0]), person("b", [1]))).toBe(1);
    expect(similarity(qs, person("a", [0]), person("b", [0]))).toBe(0);
  });

  it("wertet im Modus „ergänzend“ mit Zuordnung nur Gegenstücke, in beide Richtungen", () => {
    const qs = questionsFromInput([
      {
        text: "Rolle",
        matchMode: "complementary",
        weight: 1,
        // Tech ↔ Business (nur einseitig eingetragen, wird symmetrisch gemacht); Design ohne Gegenstück
        options: [
          { label: "Tech", complements: [1] },
          { label: "Business", complements: [] },
          { label: "Design", complements: [] },
        ],
      },
    ]);
    expect(similarity(qs, person("a", [0]), person("b", [1]))).toBe(1);
    expect(similarity(qs, person("a", [1]), person("b", [0]))).toBe(1);
    expect(similarity(qs, person("a", [0]), person("b", [2]))).toBe(0);
    expect(similarity(qs, person("a", [2]), person("b", [2]))).toBe(0);
  });

  it("gewichtet Fragen und normalisiert auf 0–1", () => {
    const qs = questionsFromInput([same(3), same(1)]);
    expect(similarity(qs, person("a", [0, 0]), person("b", [0, 1]))).toBe(0.75);
    expect(similarity(qs, person("a", [0, 0]), person("b", [1, 0]))).toBe(0.25);
  });

  it("wertet fehlende Antworten als nicht passend", () => {
    const qs = questionsFromInput([same(), same()]);
    expect(similarity(qs, person("a", [0]), person("b", [0, 0]))).toBe(0.5);
  });
});

describe("repeatPenalty", () => {
  const history = new Map([
    [pairKey("a", "b"), { timesMet: 1, lastRound: 1 }],
    [pairKey("c", "d"), { timesMet: 1, lastRound: 4 }],
    [pairKey("e", "f"), { timesMet: 2, lastRound: 1 }],
  ]);

  it("bestraft Wiedersehen, umso stärker je kürzer her und je öfter", () => {
    expect(repeatPenalty(history, "x", "y", 5)).toBe(0);
    const longAgo = repeatPenalty(history, "b", "a", 5);
    const recent = repeatPenalty(history, "c", "d", 5);
    expect(longAgo).toBeGreaterThan(1);
    expect(recent).toBeGreaterThan(longAgo);
    expect(repeatPenalty(history, "e", "f", 5)).toBeGreaterThan(recent);
  });
});

describe("seededRandom", () => {
  it("liefert für denselben Seed dieselbe Folge im Bereich [0, 1)", () => {
    const a = seededRandom("event:1");
    const b = seededRandom("event:1");
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seededRandom("event:2")()).not.toBe(values[0]);
  });
});
