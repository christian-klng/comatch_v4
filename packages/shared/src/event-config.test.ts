import { describe, expect, it } from "vitest";
import { eventSettingsInput, type QuestionInput } from "./event-config.ts";

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
