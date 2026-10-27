import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  QUESTION_WEIGHTS,
  type MatchMode,
  type QuestionInput,
} from "@comatch/shared";
import { Button, Field, Input, Select, cx } from "./ui.tsx";

const WEIGHT_LABELS: Record<number, string> = {
  0.5: "weniger wichtig (×0,5)",
  1: "normal (×1)",
  1.5: "etwas wichtiger (×1,5)",
  2: "wichtig (×2)",
  3: "sehr wichtig (×3)",
};

const MODES: { value: MatchMode; label: string; hint: string }[] = [
  { value: "same", label: "Gleiche Antworten", hint: "Wer dasselbe antwortet, passt zusammen." },
  {
    value: "complementary",
    label: "Ergänzende Antworten",
    hint: "Wer sich ergänzt, passt zusammen, z. B. Tech ↔ Business.",
  },
];

// ---------------------------------------------------------------------------
// Reine Hilfsfunktionen für Änderungen an einer Frage
// ---------------------------------------------------------------------------

function toggleComplement(q: QuestionInput, a: number, b: number): QuestionInput {
  const linked = q.options[a]!.complements.includes(b);
  return {
    ...q,
    options: q.options.map((o, i) => {
      if (i !== a && i !== b) return o;
      const other = i === a ? b : a;
      const complements = linked
        ? o.complements.filter((c) => c !== other)
        : [...o.complements, other].sort((x, y) => x - y);
      return { ...o, complements };
    }),
  };
}

function removeOption(q: QuestionInput, index: number): QuestionInput {
  return {
    ...q,
    options: q.options
      .filter((_, i) => i !== index)
      .map((o) => ({
        ...o,
        complements: o.complements.filter((c) => c !== index).map((c) => (c > index ? c - 1 : c)),
      })),
  };
}

function setMode(q: QuestionInput, matchMode: MatchMode): QuestionInput {
  // Zuordnungen gibt es nur im Modus „ergänzend“; beim Wechsel zu „gleich“ verwerfen.
  return matchMode === "same"
    ? { ...q, matchMode, options: q.options.map((o) => ({ ...o, complements: [] })) }
    : { ...q, matchMode };
}

// ---------------------------------------------------------------------------

function QuestionCard({
  index,
  question: q,
  onChange,
  issues,
  disabled,
}: {
  index: number;
  question: QuestionInput;
  onChange: (q: QuestionInput) => void;
  issues: Record<string, string>;
  disabled: boolean;
}) {
  const issue = (path: string) => issues[`${index}.${path}`];
  const hasAnyComplement = q.options.some((o) => o.complements.length > 0);

  return (
    <fieldset disabled={disabled} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <legend className="sr-only">Frage {index + 1}</legend>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
          {index + 1}
        </span>
        <Input
          aria-label={`Frage ${index + 1}`}
          className="text-base font-medium"
          placeholder="Frage eingeben"
          maxLength={140}
          value={q.text}
          invalid={!!issue("text")}
          onChange={(e) => onChange({ ...q, text: e.target.value })}
        />
      </div>
      {issue("text") && <p className="-mt-2 mb-3 pl-10 text-sm text-rose-600">{issue("text")}</p>}

      <div className="grid gap-4 pl-10 md:grid-cols-[1fr_auto]">
        <div role="radiogroup" aria-label="Matching-Modus" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Matching</span>
          <div className="flex rounded-lg bg-slate-100 p-1">
            {MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={q.matchMode === mode.value}
                onClick={() => onChange(setMode(q, mode.value))}
                className={cx(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition",
                  q.matchMode === mode.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">{MODES.find((m) => m.value === q.matchMode)?.hint}</p>
        </div>
        <Field label="Gewichtung" htmlFor={`weight-${index}`}>
          <Select
            id={`weight-${index}`}
            value={q.weight}
            onChange={(e) => onChange({ ...q, weight: Number(e.target.value) })}
          >
            {QUESTION_WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {WEIGHT_LABELS[w]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-5 flex flex-col gap-3 pl-10">
        <span className="text-sm font-medium text-slate-700">Antworten</span>
        {q.options.map((option, oIndex) => (
          <div key={oIndex} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Antwort ${oIndex + 1}`}
                placeholder={`Antwort ${oIndex + 1}`}
                maxLength={60}
                value={option.label}
                invalid={!!issue(`options.${oIndex}.label`)}
                onChange={(e) =>
                  onChange({
                    ...q,
                    options: q.options.map((o, i) => (i === oIndex ? { ...o, label: e.target.value } : o)),
                  })
                }
              />
              <Button
                variant="ghost"
                aria-label={`Antwort ${oIndex + 1} entfernen`}
                disabled={q.options.length <= MIN_OPTIONS}
                onClick={() => onChange(removeOption(q, oIndex))}
              >
                ✕
              </Button>
            </div>
            {q.matchMode === "complementary" && (
              <div className="flex flex-wrap items-center gap-1.5 pl-1 text-sm">
                <span className="text-slate-500">passt zu:</span>
                {q.options.map((other, otherIndex) =>
                  otherIndex === oIndex ? null : (
                    <button
                      key={otherIndex}
                      type="button"
                      aria-pressed={option.complements.includes(otherIndex)}
                      onClick={() => onChange(toggleComplement(q, oIndex, otherIndex))}
                      className={cx(
                        "rounded-full px-2.5 py-0.5 ring-1 transition",
                        option.complements.includes(otherIndex)
                          ? "bg-brand text-white ring-brand"
                          : "bg-white text-slate-600 ring-slate-300 hover:ring-brand",
                      )}
                    >
                      {other.label || `Antwort ${otherIndex + 1}`}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
        {issue("options") && <p className="text-sm text-rose-600">{issue("options")}</p>}
        {q.matchMode === "complementary" && !hasAnyComplement && (
          <p className="text-sm text-slate-500">Ohne Zuordnung passt jede andere Antwort.</p>
        )}
        {q.options.length < MAX_OPTIONS && (
          <div>
            <Button
              variant="secondary"
              onClick={() => onChange({ ...q, options: [...q.options, { label: "", complements: [] }] })}
            >
              + Antwort
            </Button>
          </div>
        )}
      </div>
    </fieldset>
  );
}

export function QuestionsEditor({
  questions,
  onChange,
  issues,
  disabled = false,
}: {
  questions: QuestionInput[];
  onChange: (questions: QuestionInput[]) => void;
  issues: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {questions.map((q, index) => (
        <QuestionCard
          key={index}
          index={index}
          question={q}
          issues={issues}
          disabled={disabled}
          onChange={(updated) => onChange(questions.map((existing, i) => (i === index ? updated : existing)))}
        />
      ))}
    </div>
  );
}
