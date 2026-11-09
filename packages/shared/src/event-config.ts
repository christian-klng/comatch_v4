import { z } from "zod";
import { DEFAULT_LANGUAGE, LANGUAGES, MATCH_MODES, type Language } from "./domain.ts";

export const QUESTION_COUNT = 3;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

export const DEFAULT_ROUND_DURATION_S = 5 * 60;
export const DEFAULT_FIRST_MATCH_DELAY_S = 30;
export const MIN_ROUND_DURATION_S = 2 * 60;
export const MAX_ROUND_DURATION_S = 15 * 60;

export const QUESTION_WEIGHTS = [0.5, 1, 1.5, 2, 3] as const;

export const LOGO_MAX_BYTES = 512 * 1024;
/** Erlaubte Bildformate für Logos und Selfies. */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const answerOptionInput = z.object({
  label: z.string().trim().min(1, "Bitte eine Antwort eingeben.").max(60),
  /** Indizes der Gegen-Optionen innerhalb derselben Frage (nur im Modus "complementary"). */
  complements: z.array(z.number().int().min(0)).default([]),
});

export const questionInput = z
  .object({
    text: z.string().trim().min(1, "Bitte eine Frage eingeben.").max(140),
    matchMode: z.enum(MATCH_MODES).default("same"),
    weight: z.number().min(0.5).max(3).default(1),
    options: z.array(answerOptionInput).min(MIN_OPTIONS).max(MAX_OPTIONS),
  })
  .superRefine((question, ctx) => {
    question.options.forEach((option, index) => {
      if (option.complements.length > 0 && question.matchMode !== "complementary") {
        ctx.addIssue({
          code: "custom",
          path: ["options", index, "complements"],
          message: "Gegen-Optionen gibt es nur im Modus „ergänzend“.",
        });
      }
      for (const target of option.complements) {
        if (target >= question.options.length || target === index) {
          ctx.addIssue({
            code: "custom",
            path: ["options", index, "complements"],
            message: "Ungültige Gegen-Option.",
          });
        }
      }
    });
  });

export const questionsInput = z.array(questionInput).length(QUESTION_COUNT);

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Farbe im Format #RRGGBB angeben.");

/** Allgemeine Einstellungen, die jederzeit geändert werden dürfen. */
export const eventGeneralInput = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel eingeben.").max(100),
  startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  roundDurationS: z
    .number()
    .int()
    .min(MIN_ROUND_DURATION_S)
    .max(MAX_ROUND_DURATION_S)
    .default(DEFAULT_ROUND_DURATION_S),
  firstMatchDelayS: z.number().int().min(5).max(120).default(DEFAULT_FIRST_MATCH_DELAY_S),
  primaryColor: hexColor.nullable().default(null),
  language: z.enum(LANGUAGES).default(DEFAULT_LANGUAGE),
});

export const eventCreateInput = eventGeneralInput.pick({ title: true, startsAt: true, language: true });

/** Komplette Event-Konfiguration (z. B. für Seed und Vorlagen). */
export const eventSettingsInput = eventGeneralInput.extend({ questions: questionsInput });

export type AnswerOptionInput = z.infer<typeof answerOptionInput>;
export type QuestionInput = z.infer<typeof questionInput>;
export type EventGeneralInput = z.infer<typeof eventGeneralInput>;
export type EventCreateInput = z.infer<typeof eventCreateInput>;
export type EventSettingsInput = z.infer<typeof eventSettingsInput>;

/**
 * Macht Gegen-Optionen symmetrisch (A passt zu B ⇒ B passt zu A), entfernt Duplikate
 * und leert sie im Modus „gleich“.
 */
export function normalizeComplements(question: QuestionInput): QuestionInput {
  const sets = question.options.map(() => new Set<number>());
  if (question.matchMode === "complementary") {
    question.options.forEach((option, index) => {
      for (const target of option.complements) {
        sets[index]!.add(target);
        sets[target]?.add(index);
      }
    });
  }
  return {
    ...question,
    options: question.options.map((option, index) => ({
      ...option,
      complements: [...sets[index]!].sort((a, b) => a - b),
    })),
  };
}

/** Beispielfragen für neue deutschsprachige Events. */
export const DEFAULT_QUESTIONS: QuestionInput[] = [
  {
    text: "In welcher Phase ist dein Startup?",
    matchMode: "same",
    weight: 1,
    options: [
      { label: "Idee", complements: [] },
      { label: "Pre-Seed", complements: [] },
      { label: "Seed", complements: [] },
      { label: "Series A+", complements: [] },
    ],
  },
  {
    text: "Was bringst du mit?",
    matchMode: "complementary",
    weight: 1,
    options: [
      { label: "Tech", complements: [1] },
      { label: "Business", complements: [0, 2] },
      { label: "Design", complements: [1] },
    ],
  },
  {
    text: "Welche Branche?",
    matchMode: "same",
    weight: 1,
    options: [
      { label: "Climate", complements: [] },
      { label: "Health", complements: [] },
      { label: "Fintech", complements: [] },
      { label: "Andere", complements: [] },
    ],
  },
];

/** Beispielfragen für neue englischsprachige Events (gleiche Struktur wie DEFAULT_QUESTIONS). */
const DEFAULT_QUESTIONS_EN: QuestionInput[] = [
  {
    text: "What stage is your startup at?",
    matchMode: "same",
    weight: 1,
    options: [
      { label: "Idea", complements: [] },
      { label: "Pre-Seed", complements: [] },
      { label: "Seed", complements: [] },
      { label: "Series A+", complements: [] },
    ],
  },
  {
    text: "What do you bring to the table?",
    matchMode: "complementary",
    weight: 1,
    options: [
      { label: "Tech", complements: [1] },
      { label: "Business", complements: [0, 2] },
      { label: "Design", complements: [1] },
    ],
  },
  {
    text: "Which industry?",
    matchMode: "same",
    weight: 1,
    options: [
      { label: "Climate", complements: [] },
      { label: "Health", complements: [] },
      { label: "Fintech", complements: [] },
      { label: "Other", complements: [] },
    ],
  },
];

/** Beispielfragen in der Sprache des Events. */
export function defaultQuestions(language: Language): QuestionInput[] {
  return language === "en" ? DEFAULT_QUESTIONS_EN : DEFAULT_QUESTIONS;
}
