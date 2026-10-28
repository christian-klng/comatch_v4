import { useState, type FormEvent } from "react";
import {
  CODE_LENGTH,
  type CommonGround,
  type ConfirmCodeResult,
  type MatchPartner,
  type ParticipantLive,
  type ParticipantMatch,
} from "@comatch/shared";
import { cx } from "../../components/ui.tsx";
import { api, errorMessage } from "../../lib/api.ts";
import { formatCountdown, useRemaining } from "../../lib/live.ts";
import { PrimaryButton } from "./parts.tsx";

interface MatchProps {
  match: ParticipantMatch;
  round: number;
  remaining: number | null;
  offsetMs: number;
  token: string;
  /** Neuer Zustand aus der Antwort des Servers (kommt sonst kurz darauf per Socket). */
  onState: (state: ParticipantLive) => void;
}

function GroundList({ items, compact }: { items: CommonGround[]; compact?: boolean }) {
  if (items.length === 0) {
    return (
      <p className={cx("text-center text-slate-400", compact ? "text-xs" : "text-sm")}>
        Ganz verschiedene Antworten: perfekt für neue Perspektiven.
      </p>
    );
  }
  return (
    <ul className={cx("flex flex-wrap justify-center gap-1.5", compact ? "text-xs" : "text-sm")}>
      {items.map((item) => (
        <li
          key={item.question}
          className="rounded-full bg-brand/15 px-3 py-1 text-slate-100 ring-1 ring-brand/30"
          title={item.question}
        >
          {item.kind === "same" ? `Beide: ${item.own}` : `${item.own} trifft ${item.partner}`}
        </li>
      ))}
    </ul>
  );
}

function PartnerCard({
  partner,
  highlight,
  compact,
}: {
  partner: MatchPartner;
  highlight: boolean;
  /** Dreiergruppe: kleinere Karten, die Person zum Bestätigen bekommt ein Label. */
  compact: boolean;
}) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative w-full">
        {partner.selfieUrl ? (
          <img
            src={partner.selfieUrl}
            alt="Selfie deines Matches"
            className={cx(
              "aspect-[3/4] w-full rounded-3xl object-cover",
              highlight ? "ring-4 ring-brand" : "ring-1 ring-white/20",
            )}
          />
        ) : (
          <div className="aspect-[3/4] w-full rounded-3xl bg-white/5 ring-1 ring-white/10" />
        )}
        {compact && highlight && (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-brand px-2 py-0.5 text-center text-xs font-semibold text-white">
            Diesen Code wählen
          </span>
        )}
        {partner.confirmedMe && (
          <span className="absolute top-2 right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">
            hat dich ✓
          </span>
        )}
      </div>
      <figcaption>
        <GroundList items={partner.commonGround} compact={compact} />
      </figcaption>
    </figure>
  );
}

function OwnCode({ code }: { code: string }) {
  return (
    <div className="w-full rounded-2xl bg-white/5 p-4 text-center ring-1 ring-white/10">
      <p className="text-sm text-slate-400">Dein Code</p>
      <p className="font-mono text-5xl font-bold tracking-widest text-brand tabular-nums">{code}</p>
      <p className="mt-1 text-sm text-slate-400">Zeig ihn deinem Gegenüber.</p>
    </div>
  );
}

/** Code des Gegenübers wählen (oder nach drei Fehlversuchen eintippen). */
function CodePicker({ match, offsetMs, token, onState }: Omit<MatchProps, "round" | "remaining">) {
  const { confirm } = match;
  const lockRemaining = useRemaining(confirm.lockedUntil, offsetMs);
  const locked = lockRemaining !== null && lockRemaining > 0;
  const [busy, setBusy] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const many = match.partners.length > 1;

  const submit = async (code: string) => {
    setBusy(code);
    setError(null);
    try {
      const res = await api<ConfirmCodeResult>("/participant/match/confirm", {
        method: "POST",
        body: { matchId: match.id, code },
        token,
      });
      if (res.result === "wrong") {
        navigator.vibrate?.(300);
        setTyped("");
      }
      onState(res.state);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (confirm.confirmed) {
    return (
      <div className="w-full rounded-2xl bg-emerald-500/15 p-4 text-center text-emerald-100 ring-1 ring-emerald-400/30">
        <p className="font-semibold">✓ Code bestätigt</p>
        <p className="mt-1 text-sm">
          {many
            ? "Jetzt fehlen nur noch die anderen …"
            : "Jetzt muss nur noch dein Gegenüber deinen Code wählen …"}
        </p>
      </div>
    );
  }

  const onSubmitTyped = (e: FormEvent) => {
    e.preventDefault();
    if (typed.length === CODE_LENGTH) void submit(typed);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-center font-medium">
        {many
          ? "Gefunden? Wähl den Code der markierten Person:"
          : "Gefunden? Welcher Code steht auf dem Handy deines Gegenübers?"}
      </p>
      {confirm.options ? (
        <div className="grid grid-cols-3 gap-2">
          {confirm.options.map((code) => (
            <button
              key={code}
              type="button"
              disabled={locked || busy !== null}
              onClick={() => void submit(code)}
              className={cx(
                "min-h-16 rounded-2xl bg-white/10 font-mono text-2xl font-bold tracking-widest tabular-nums ring-1 ring-white/15 transition",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                "active:scale-[0.97] disabled:opacity-40",
                busy === code && "animate-pulse",
              )}
            >
              {code}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={onSubmitTyped} className="flex flex-col gap-2">
          <p className="text-center text-sm text-slate-400">
            Zeigt euch gegenseitig eure Codes und tippt den Code deines Gegenübers ein.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Code deines Gegenübers"
            placeholder="000"
            disabled={locked}
            className="min-h-14 w-full rounded-2xl bg-white/10 text-center font-mono text-3xl tracking-widest ring-1 ring-white/15 placeholder:text-slate-600 focus:ring-brand focus:outline-none"
          />
          <PrimaryButton type="submit" busy={busy !== null} disabled={locked || typed.length !== CODE_LENGTH}>
            Bestätigen
          </PrimaryButton>
        </form>
      )}
      {locked ? (
        <p role="status" className="text-center text-sm text-rose-200">
          Das war nicht der richtige Code. Noch {Math.ceil(lockRemaining / 1000)} s, dann nochmal.
        </p>
      ) : (
        confirm.wrongAttempts > 0 &&
        confirm.options && (
          <p className="text-center text-sm text-slate-400">Schau genau hin: Die Codes sehen sich ähnlich.</p>
        )
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}

/** „Nicht gefunden“ – ab Rundenmitte, mit Rückfrage. */
function NotFound({ match, offsetMs, token, onState }: Omit<MatchProps, "round" | "remaining">) {
  const wait = useRemaining(match.notFoundFrom, offsetMs);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (match.notFoundFrom === null || wait === null) return null;

  if (wait > 0) {
    return (
      <p className="text-center text-sm text-slate-500 tabular-nums">
        Noch nicht gefunden? In {formatCountdown(wait)} kannst du ein neues Match bekommen.
      </p>
    );
  }

  const giveUp = async () => {
    setBusy(true);
    setError(null);
    try {
      onState(
        await api<ParticipantLive>("/participant/match/not-found", {
          method: "POST",
          body: { matchId: match.id },
          token,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {asking ? (
        <div className="flex w-full flex-col gap-2 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-sm text-slate-300">Neues Match suchen? Dieses Match endet dann.</p>
          <div className="flex gap-2">
            <PrimaryButton busy={busy} onClick={() => void giveUp()}>
              Ja, neues Match
            </PrimaryButton>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsking(false)}
              className="min-h-14 shrink-0 rounded-2xl px-4 text-slate-300"
            >
              Weitersuchen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="py-2 text-sm text-slate-400 underline underline-offset-4"
        >
          {match.partners.length > 1 ? "Ich finde die beiden nicht" : "Person nicht gefunden"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}

/** Match läuft: Selfies, Gemeinsamkeiten, eigener Code und Auswahl des Codes. */
export function MatchScreen(props: MatchProps) {
  const { match, round, remaining } = props;
  const many = match.partners.length > 1;
  return (
    <div className="flex flex-1 flex-col items-center gap-4">
      <p className="text-sm text-slate-400 tabular-nums">
        Runde {round} · noch {formatCountdown(remaining)}
      </p>
      <h1 className="text-center text-3xl font-bold">
        {many ? "Finde diese beiden!" : "Finde diese Person!"}
      </h1>
      <div className={many ? "grid w-full grid-cols-2 gap-3" : "w-full max-w-48"}>
        {match.partners.map((p) => (
          <PartnerCard
            key={p.id}
            partner={p}
            compact={many}
            highlight={!many || p.id === match.confirm.targetId}
          />
        ))}
      </div>
      <OwnCode code={match.ownCode} />
      <CodePicker {...props} />
      <div className="mt-auto">
        <NotFound {...props} />
      </div>
    </div>
  );
}

/** Alle haben bestätigt: Erfolg und Zeit zum Reden bis zur nächsten Runde. */
export function ConfirmedScreen({ match, remaining }: Pick<MatchProps, "match" | "remaining">) {
  const many = match.partners.length > 1;
  return (
    <div className="flex flex-1 flex-col items-center gap-5 text-center">
      <span className="animate-[pop_600ms_ease-out] text-6xl" aria-hidden>
        🎉
      </span>
      <div>
        <h1 className="text-3xl font-bold">Ihr habt euch gefunden!</h1>
        <p className="mt-2 text-slate-400 tabular-nums">
          Zeit zum Reden. Die nächste Runde startet in {formatCountdown(remaining)}.
        </p>
      </div>
      <div className={many ? "grid w-full grid-cols-2 gap-3" : "w-full max-w-56"}>
        {match.partners.map((p) =>
          p.selfieUrl ? (
            <img
              key={p.id}
              src={p.selfieUrl}
              alt="Selfie deines Matches"
              className="aspect-[3/4] w-full rounded-3xl object-cover ring-4 ring-emerald-500"
            />
          ) : (
            <div key={p.id} className="aspect-[3/4] w-full rounded-3xl bg-white/5" />
          ),
        )}
      </div>
      <div className="flex w-full flex-col gap-2 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <p className="text-sm font-medium text-slate-300">Gesprächseinstieg</p>
        {match.partners.map((p) => (
          <GroundList key={p.id} items={p.commonGround} />
        ))}
      </div>
    </div>
  );
}
