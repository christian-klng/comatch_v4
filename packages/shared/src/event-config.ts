import { z } from "zod";
import { MATCH_MODES } from "./domain.ts";

export const QUESTION_COUNT = 3;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

export const DEFAULT_ROUND_DURATION_S = 5 * 60;
export const DEFAULT_FIRST_MATCH_DELAY_S = 30;

export const answerOptionInput = z.object({
  label: z.string().trim().min(1).max(60),
  /** Indizes der Gegen-Optionen innerhalb derselben Frage (nur im Modus "complementary"). */
  complements: z.array(z.number().int().min(0)).default([]),
});

export const questionInput = z
  .object({
    text: z.string().trim().min(1).max(140),
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

export const eventSettingsInput = z.object({
  title: z.string().trim().min(1).max(100),
  roundDurationS: z
    .number()
    .int()
    .min(2 * 60)
    .max(15 * 60)
    .default(DEFAULT_ROUND_DURATION_S),
  firstMatchDelayS: z.number().int().min(5).max(120).default(DEFAULT_FIRST_MATCH_DELAY_S),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  questions: z.array(questionInput).length(QUESTION_COUNT),
});

export type AnswerOptionInput = z.infer<typeof answerOptionInput>;
export type QuestionInput = z.infer<typeof questionInput>;
export type EventSettingsInput = z.infer<typeof eventSettingsInput>;
