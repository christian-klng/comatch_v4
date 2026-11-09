import { useEffect, useRef, useState } from "react";
import {
  POOL_CUTOFF_MS,
  type ParticipantLive,
  type ParticipantMe,
  type PublicEvent,
  type SessionEndReason,
} from "@comatch/shared";
import { errorText, useT } from "../../i18n/index.tsx";
import { formatCountdown, useLive, useRemaining } from "../../lib/live.ts";
import { useWakeLock } from "../../lib/wakeLock.ts";
import { ConfirmedScreen, MatchScreen } from "./MatchScreen.tsx";
import { Message, PrimaryButton, SecondaryButton } from "./parts.tsx";

/** Kurz vibrieren, sobald ein neues Match da ist, und doppelt, wenn es bestätigt ist. */
function useVibrate(state: ParticipantLive | null) {
  const key = state ? (state.match ? `${state.match.id}:${state.match.status}` : "") : null;
  // null: noch kein Zustand da (z. B. nach dem Neuladen). Der erste Zustand ist nichts Neues.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    if (previous.current !== null && key && key !== previous.current) {
      navigator.vibrate?.(key.endsWith(":confirmed") ? [100, 60, 100] : 200);
    }
    previous.current = key;
  }, [key]);
}

function PulseDots() {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2.5 animate-pulse rounded-full bg-brand"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}

/** Selfie ändern und aussteigen, mit Rückfrage. */
function Footer({ onChangeSelfie, onLeave }: { onChangeSelfie: () => void; onLeave: () => Promise<void> }) {
  const t = useT();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = async () => {
    setLeaving(true);
    setError(null);
    try {
      await onLeave();
    } catch (err) {
      setError(errorText(t, err));
      setLeaving(false);
    }
  };

  return (
    <div className="mt-auto flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {confirmLeave ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-sm text-slate-300">{t.live.leaveConfirm}</p>
          <PrimaryButton busy={leaving} className="bg-rose-600 shadow-none" onClick={() => void leave()}>
            {t.live.leaveYes}
          </PrimaryButton>
          <SecondaryButton disabled={leaving} onClick={() => setConfirmLeave(false)}>
            {t.live.cancel}
          </SecondaryButton>
        </div>
      ) : (
        <>
          <SecondaryButton onClick={onChangeSelfie}>{t.live.changeSelfie}</SecondaryButton>
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="py-2 text-sm text-slate-500 underline-offset-4 hover:underline"
          >
            {t.live.leave}
          </button>
        </>
      )}
    </div>
  );
}

function Waiting({
  event,
  me,
  state,
  remaining,
}: {
  event: PublicEvent;
  me: ParticipantMe;
  state: ParticipantLive | null;
  remaining: number | null;
}) {
  const labels = event.questions.flatMap(
    (q, i) => q.options.find((o) => o.id === me.answers[i])?.label ?? [],
  );
  const t = useT();
  const status = state?.clock.status ?? event.status;

  let title = t.live.inTitle;
  let hint = t.live.inHint;
  if (status === "running") {
    if ((state?.activeParticipants ?? 0) < 2) {
      hint = t.live.firstPerson;
    } else if (remaining !== null && remaining < POOL_CUTOFF_MS) {
      title = t.live.soonTitle;
      hint = t.live.soonHint(formatCountdown(remaining));
    } else if (state?.previousMatchEnded) {
      title = t.live.researchTitle;
      hint = t.live.researchHint;
    } else {
      title = t.live.searchTitle;
      hint = t.live.searchHint;
    }
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-5 text-center">
      {me.selfieUrl && (
        <img
          src={me.selfieUrl}
          alt={t.live.yourSelfie}
          className="aspect-[3/4] w-40 rounded-3xl object-cover ring-4 ring-brand"
        />
      )}
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-400">{hint}</p>
      </div>
      <PulseDots />
      {labels.length > 0 && (
        <ul
          className="flex flex-wrap justify-center gap-2 text-sm text-slate-300"
          aria-label={t.live.yourAnswers}
        >
          {labels.map((label) => (
            <li key={label} className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Alles nach dem Beitritt: Lobby, Suche, Match, Pause und Ende. Der Server schickt bei jeder
 * Änderung den vollständigen Zustand; Countdowns rechnen mit dem gemessenen Uhren-Offset.
 */
export function LiveView({
  event,
  me,
  token,
  onChangeSelfie,
  onLeave,
  onSessionInvalid,
  onSelfieReset,
}: {
  event: PublicEvent;
  me: ParticipantMe;
  token: string;
  onChangeSelfie: () => void;
  onLeave: () => Promise<void>;
  onSessionInvalid: (reason: SessionEndReason) => void;
  /** Die Moderation hat das Selfie zurückgesetzt: neu fotografieren. */
  onSelfieReset: () => void;
}) {
  const t = useT();
  const live = useLive<ParticipantLive>({ role: "participant", token }, "state");
  // Antworten auf eigene Aktionen kommen per REST und Socket; der neuere Zustand gewinnt.
  const [fromResponse, setFromResponse] = useState<ParticipantLive | null>(null);
  const state =
    fromResponse && (!live.data || fromResponse.serverNow > live.data.serverNow) ? fromResponse : live.data;
  const remaining = useRemaining(state?.clock.roundEndsAt ?? null, live.offsetMs);
  useWakeLock();
  useVibrate(state);

  useEffect(() => {
    if (live.invalid) onSessionInvalid(live.invalid);
  }, [live.invalid, onSessionInvalid]);

  const selfieReset = state?.status === "onboarding";
  useEffect(() => {
    if (selfieReset) onSelfieReset();
  }, [selfieReset, onSelfieReset]);

  const status = state?.clock.status ?? event.status;
  const offline = state && !live.connected && (
    <p role="status" className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
      {t.common.reconnecting}
    </p>
  );

  if (status === "ended") {
    return (
      <Message icon="🎉" title={t.live.endedTitle}>
        {t.live.endedText}
      </Message>
    );
  }
  if (status === "paused") {
    return (
      <>
        {offline}
        <Message icon="☕" title={t.live.pauseTitle}>
          {t.live.pauseText}
        </Message>
        <Footer onChangeSelfie={onChangeSelfie} onLeave={onLeave} />
      </>
    );
  }
  if (status === "running" && state?.match?.status === "confirmed") {
    return (
      <>
        {offline}
        <ConfirmedScreen match={state.match} remaining={remaining} />
      </>
    );
  }
  if (status === "running" && state?.match) {
    return (
      <>
        {offline}
        <MatchScreen
          key={state.match.id}
          match={state.match}
          round={state.clock.round}
          remaining={remaining}
          offsetMs={live.offsetMs}
          token={token}
          onState={setFromResponse}
        />
      </>
    );
  }
  return (
    <>
      {offline}
      <Waiting event={event} me={me} state={state} remaining={remaining} />
      <Footer onChangeSelfie={onChangeSelfie} onLeave={onLeave} />
    </>
  );
}
