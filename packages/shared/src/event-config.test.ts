import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUESTIONS,
  eventSettingsInput,
  normalizeComplements,
  questionsInput,
  type QuestionInput,
} from "./event-config.ts";

const question = (overrides: Partial<QuestionInput> = {}) => ({
  text: "In welcher Phase ist dein Startup?",
  options: [
    { label: "Idee", complements: [] },
    { label: "Seed", complements: [] },
  ],
  ...overrides,
});

describe("eventSettingsInput", () => {
  it("setzt Standardwerte für Rundendauer und Erstmatch", () => {
    const parsed = eventSettingsInput.parse({
      title: "Founders Night",
      questions: [question(), question(), question()],
    });
    expect(parsed.roundDurationS).toBe(300);
    expect(parsed.firstMatchDelayS).toBe(30);
    expect(parsed.questions[0]?.matchMode).toBe("same");
  });

  it("verlangt genau drei Fragen", () => {
    const result = eventSettingsInput.safeParse({ title: "x", questions: [question()] });
    expect(result.success).toBe(false);
  });

  it("erlaubt Gegen-Optionen nur im Modus ergänzend", () => {
    const withComplement = {
      options: [
        { label: "Tech", complements: [1] },
        { label: "Business", complements: [0] },
      ],
    };
    const same = eventSettingsInput.safeParse({
      title: "x",
      questions: [question(withComplement), question(), question()],
    });
    expect(same.success).toBe(false);

    const complementary = eventSettingsInput.safeParse({
      title: "x",
      questions: [question({ ...withComplement, matchMode: "complementary" }), question(), question()],
    });
    expect(complementary.success).toBe(true);
  });

  it("lehnt Verweise auf sich selbst oder nicht existierende Optionen ab", () => {
    const result = eventSettingsInput.safeParse({
      title: "x",
      questions: [
        question({
          matchMode: "complementary",
          options: [
            { label: "A", complements: [0] },
            { label: "B", complements: [5] },
          ],
        }),
        question(),
        question(),
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizeComplements", () => {
  it("macht Zuordnungen symmetrisch und entfernt Duplikate", () => {
    const normalized = normalizeComplements({
      text: "Was bringst du mit?",
      matchMode: "complementary",
      weight: 1,
      options: [
        { label: "Tech", complements: [1, 1] },
        { label: "Business", complements: [] },
        { label: "Design", complements: [1] },
      ],
    });
    expect(normalized.options.map((o) => o.complements)).toEqual([[1], [0, 2], [1]]);
  });

  it("leert Zuordnungen im Modus gleich", () => {
    const normalized = normalizeComplements({
      text: "x",
      matchMode: "same",
      weight: 1,
      options: [
        { label: "A", complements: [1] },
        { label: "B", complements: [] },
      ],
    });
    expect(normalized.options.every((o) => o.complements.length === 0)).toBe(true);
  });
});

describe("DEFAULT_QUESTIONS", () => {
  it("sind gültig", () => {
    expect(questionsInput.safeParse(DEFAULT_QUESTIONS).success).toBe(true);
  });
});
