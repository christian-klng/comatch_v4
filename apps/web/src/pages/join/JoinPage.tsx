import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import type { JoinResult, ParticipantMe, PublicEvent, SessionEndReason } from "@comatch/shared";
import { Spinner, cx } from "../../components/ui.tsx";
import { ApiError, api, errorMessage } from "../../lib/api.ts";
import { loadDraftAnswers, loadToken, saveDraftAnswers, saveToken } from "../../lib/participantSession.ts";
import { LegalLinks } from "../../components/LegalLinks.tsx";
import { Message, PrimaryButton, Screen, SecondaryButton } from "./parts.tsx";
import { LiveView } from "./LiveView.tsx";
import { SelfieStep } from "./SelfieStep.tsx";

type Phase =
  | { name: "loading" }
  | { name: "failed"; message: string; notFound?: boolean }
  | { name: "welcome" }
  | { name: "question"; index: number }
  | { name: "selfie" }
  | { name: "ready" }
  | { name: "left" };

const ADVANCE_DELAY_MS = 250;

/** Lädt das Event und stellt eine gespeicherte Sitzung wieder her (z. B. nach Neuladen). */
async function fetchSession(slug: string) {
  const event = await api<PublicEvent>(`/events/${slug}`);
  const stored = loadToken(slug);
  let me: ParticipantMe | null = null;
  let notice: string | null = null;
  if (stored) {
    try {
      me = await api<ParticipantMe>("/participant", { token: stored });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
      saveToken(slug, null);
      if (err.code === "participant_removed") notice = err.message;
    }
  }
  return { event, token: me ? stored : null, me, notice };
}

// ---------------------------------------------------------------------------

function Welcome({
  event,
  onStart,
  onReload,
}: {
  event: PublicEvent;
  onStart: () => void;
  onReload: () => void;
}) {
  if (event.status === "ended") {
    return (
      <Message icon="🌙" title="Das Event ist vorbei">
        Danke fürs Mitmachen!
      </Message>
    );
  }
  if (!event.joinable) {
    return (
      <>
        <Message icon="⏳" title="Gleich geht’s los">
          {event.title} ist noch nicht geöffnet. Probier es in ein paar Minuten noch einmal.
        </Message>
        <SecondaryButton onClick={onReload}>Neu laden</SecondaryButton>
      </>
    );
  }

  const minutes = Math.round(event.roundDurationS / 60);
  const steps = [
    ["💬", "Drei kurze Fragen", "Damit wir passende Leute für dich finden."],
    ["🤳", "Ein Selfie", "Daran erkennt dich dein Match im Raum."],
    ["🤝", `Alle ${minutes} Minuten ein Match`, "Findet euch, vergleicht eure Codes, redet."],
  ] as const;

  return (
    <>
      <div className="mt-4">
        <p className="text-sm font-medium tracking-wide text-brand uppercase">Willkommen bei</p>
        <h1 className="mt-1 text-3xl leading-tight font-bold">{event.title}</h1>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map(([icon, title, text]) => (
          <li key={title} className="flex items-center gap-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <span className="text-3xl" aria-hidden>
              {icon}
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-slate-400">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-center text-sm text-slate-500">Ohne Namen, ohne Konto, ohne App.</p>
      <PrimaryButton className="mt-auto" onClick={onStart}>
        Los geht’s
      </PrimaryButton>
      <LegalLinks className="-mt-2 text-center text-xs text-slate-500" />
    </>
  );
}

function QuestionStep({
  event,
  index,
  selected,
  onSelect,
  onBack,
}: {
  event: PublicEvent;
  index: number;
  selected: string | undefined;
  onSelect: (optionId: string) => void;
  onBack: () => void;
}) {
  const question = event.questions[index]!;
  const total = event.questions.length;
  return (
    <>
      <div>
        <p className="text-sm text-slate-400">
          Frage {index + 1} von {total}
        </p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {event.questions.map((q, i) => (
            <span
              key={q.id}
              className={cx("h-1.5 flex-1 rounded-full", i <= index ? "bg-brand" : "bg-white/10")}
            />
          ))}
        </div>
      </div>
      <h2 className="text-2xl leading-snug font-semibold">{question.text}</h2>
      <div role="radiogroup" aria-label={question.text} className="flex flex-col gap-3">
        {question.options.map((option) => {
          const active = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(option.id)}
              className={cx(
                "min-h-16 rounded-2xl px-5 py-4 text-left text-lg font-medium ring-1 transition active:scale-[0.98]",
                active ? "bg-brand text-white ring-brand" : "bg-white/5 text-slate-100 ring-white/10",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <SecondaryButton className="mt-auto" onClick={onBack}>
        Zurück
      </SecondaryButton>
    </>
  );
}

// ---------------------------------------------------------------------------

export function JoinPage() {
  const slug = useParams().slug!;
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<ParticipantMe | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(() => loadDraftAnswers(slug));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const resetSession = useCallback(() => {
    saveToken(slug, null);
    setToken(null);
    setMe(null);
  }, [slug]);

  const load = useCallback(() => {
    fetchSession(slug).then(
      (session) => {
        setEvent(session.event);
        setToken(session.token);
        setMe(session.me);
        if (session.notice) setNotice(session.notice);
        const next: Phase = !session.me
          ? { name: "welcome" }
          : session.me.status === "onboarding"
            ? { name: "selfie" }
            : { name: "ready" };
        setPhase(next);
      },
      (err: unknown) => {
        const notFound = err instanceof ApiError && err.status === 404;
        setPhase({
          name: "failed",
          notFound,
          message: notFound ? "Prüf den Link oder scanne den QR-Code noch einmal." : errorMessage(err),
        });
      },
    );
  }, [slug]);

  useEffect(() => {
    load();
    return () => clearTimeout(advanceTimer.current);
  }, [load]);

  const reload = () => {
    setPhase({ name: "loading" });
    load();
  };

  const selectAnswer = (index: number, optionId: string) => {
    const next = { ...answers, [event!.questions[index]!.id]: optionId };
    setAnswers(next);
    saveDraftAnswers(slug, next);
    clearTimeout(advanceTimer.current);
    // Kurz stehen lassen, damit die Auswahl sichtbar ist, dann automatisch weiter.
    advanceTimer.current = setTimeout(() => {
      setPhase(
        index + 1 < event!.questions.length ? { name: "question", index: index + 1 } : { name: "selfie" },
      );
    }, ADVANCE_DELAY_MS);
  };

  const submitSelfie = async (photo: Blob) => {
    setBusy(true);
    setError(null);
    try {
      let current = token;
      if (!current) {
        const result = await api<JoinResult>(`/events/${slug}/join`, {
          method: "POST",
          body: { answers: event!.questions.map((q) => answers[q.id]), consent: true },
        });
        current = result.token;
        saveToken(slug, current);
        saveDraftAnswers(slug, null);
        setToken(current);
        setMe(result.participant);
      }
      setMe(await api<ParticipantMe>("/participant/selfie", { method: "PUT", body: photo, token: current }));
      setNotice(null);
      setPhase({ name: "ready" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "questions_changed") {
        setAnswers({});
        saveDraftAnswers(slug, null);
        setNotice(err.message);
        reload();
      } else if (err instanceof ApiError && err.status === 401) {
        resetSession();
        setNotice(err.message);
        setPhase({ name: "welcome" });
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  // Sitzung vom Server abgelehnt (z. B. in einem anderen Tab ausgestiegen oder entfernt).
  const sessionInvalid = useCallback(
    (reason: SessionEndReason) => {
      resetSession();
      setNotice(
        reason === "removed"
          ? "Die Moderation hat dich aus dem Event entfernt."
          : "Deine Sitzung ist abgelaufen. Du kannst neu beitreten.",
      );
      setPhase({ name: "welcome" });
    },
    [resetSession],
  );

  const selfieReset = useCallback(() => {
    setNotice(
      "Die Moderation bittet dich um ein neues Selfie. Achte darauf, dass dein Gesicht gut zu sehen ist.",
    );
    setMe((current) => (current ? { ...current, status: "onboarding", selfieUrl: null } : current));
    setPhase({ name: "selfie" });
  }, []);

  const leave = async () => {
    await api("/participant", { method: "DELETE", token: token! });
    resetSession();
    setAnswers({});
    setPhase({ name: "left" });
  };

  if (phase.name === "loading") {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center text-slate-400">
          <Spinner className="size-8" />
        </div>
      </Screen>
    );
  }
  if (phase.name === "failed" || !event) {
    const failed = phase.name === "failed" ? phase : null;
    return (
      <Screen>
        <Message icon="🤔" title={failed?.notFound ? "Event nicht gefunden" : "Das hat nicht geklappt"}>
          {failed?.message}
        </Message>
        {!failed?.notFound && <SecondaryButton onClick={reload}>Erneut versuchen</SecondaryButton>}
      </Screen>
    );
  }

  return (
    <Screen
      color={event.primaryColor}
      logoUrl={event.logoUrl}
      title={phase.name === "welcome" ? undefined : event.title}
    >
      {notice && (
        <p role="status" className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          {notice}
        </p>
      )}

      {phase.name === "welcome" && (
        <Welcome
          event={event}
          onReload={reload}
          onStart={() => {
            setNotice(null);
            setPhase({ name: "question", index: 0 });
          }}
        />
      )}

      {phase.name === "question" && (
        <QuestionStep
          key={phase.index}
          event={event}
          index={phase.index}
          selected={answers[event.questions[phase.index]!.id]}
          onSelect={(optionId) => selectAnswer(phase.index, optionId)}
          onBack={() => {
            clearTimeout(advanceTimer.current);
            setPhase(phase.index === 0 ? { name: "welcome" } : { name: "question", index: phase.index - 1 });
          }}
        />
      )}

      {phase.name === "selfie" && (
        <SelfieStep
          needsConsent={!token}
          busy={busy}
          error={error}
          onSubmit={(photo) => void submitSelfie(photo)}
          onBack={
            me?.selfieUrl
              ? () => setPhase({ name: "ready" })
              : token
                ? undefined
                : () => setPhase({ name: "question", index: event.questions.length - 1 })
          }
        />
      )}

      {phase.name === "ready" && me && token && (
        <LiveView
          event={event}
          me={me}
          token={token}
          onChangeSelfie={() => {
            setError(null);
            setPhase({ name: "selfie" });
          }}
          onLeave={leave}
          onSessionInvalid={sessionInvalid}
          onSelfieReset={selfieReset}
        />
      )}

      {phase.name === "left" && (
        <>
          <Message icon="👋" title="Du bist ausgestiegen">
            Dein Foto und deine Antworten sind gelöscht.
          </Message>
          <SecondaryButton onClick={() => setPhase({ name: "welcome" })}>
            Doch wieder mitmachen
          </SecondaryButton>
        </>
      )}
    </Screen>
  );
}
