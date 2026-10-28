import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminParticipant, EventDetail, EventLive, ParticipantStatus } from "@comatch/shared";
import { Alert, Button, Card, Spinner, cx } from "../../components/ui.tsx";
import { api, errorMessage } from "../../lib/api.ts";
import { useLive } from "../../lib/live.ts";

/** Höchstens so oft wird die Liste bei Live-Änderungen neu geladen. */
const REFRESH_MS = 2_000;

const STATUS: Record<ParticipantStatus, { label: string; className: string }> = {
  onboarding: { label: "ohne Selfie", className: "bg-amber-100 text-amber-800" },
  pool: { label: "wartet", className: "bg-sky-100 text-sky-800" },
  matched: { label: "im Match", className: "bg-indigo-100 text-indigo-800" },
  confirmed: { label: "bestätigt", className: "bg-emerald-100 text-emerald-800" },
  inactive: { label: "inaktiv", className: "bg-slate-100 text-slate-500" },
  removed: { label: "entfernt", className: "bg-slate-100 text-slate-500" },
};

type Action = { id: string; kind: "reset" | "remove" };

function ParticipantCard({
  person,
  pending,
  onAsk,
  onCancel,
  onConfirm,
  busy,
}: {
  person: AdminParticipant;
  pending: Action["kind"] | null;
  onAsk: (kind: Action["kind"]) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const status = STATUS[person.status];
  return (
    <li className="flex gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      {person.selfieUrl ? (
        <img
          src={person.selfieUrl}
          alt={`Selfie ${person.number}`}
          className="aspect-[3/4] w-20 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex aspect-[3/4] w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
          kein Selfie
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{person.number}</span>
          <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
            {status.label}
          </span>
          <span
            className={cx("size-2 rounded-full", person.online ? "bg-emerald-500" : "bg-slate-300")}
            title={person.online ? "verbunden" : "nicht verbunden"}
          />
          <span className="sr-only">{person.online ? "verbunden" : "nicht verbunden"}</span>
        </div>
        <p className="truncate text-xs text-slate-500" title={person.answers.join(" · ")}>
          {person.answers.join(" · ")}
        </p>
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700 tabular-nums">{person.confirmedMatches}</span>{" "}
          {person.confirmedMatches === 1 ? "bestätigtes Match" : "bestätigte Matches"}
        </p>
        {pending ? (
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">
              {pending === "reset" ? "Neues Selfie verlangen?" : "Person entfernen?"}
            </span>
            <Button variant="danger" className="px-2.5 py-1 text-xs" busy={busy} onClick={onConfirm}>
              Ja
            </Button>
            <Button variant="ghost" className="px-2.5 py-1 text-xs" disabled={busy} onClick={onCancel}>
              Abbrechen
            </Button>
          </div>
        ) : (
          <div className="mt-auto flex flex-wrap gap-1">
            {person.selfieUrl && (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onAsk("reset")}>
                Selfie zurücksetzen
              </Button>
            )}
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs text-rose-600"
              onClick={() => onAsk("remove")}
            >
              Entfernen
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Alle Teilnehmenden mit Selfie und Status; Eingriffe bei unpassendem Selfie. */
export function ParticipantsTab({ event }: { event: EventDetail }) {
  const [people, setPeople] = useState<AdminParticipant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useLive<EventLive>({ role: "admin", eventId: event.id }, "event_state");
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    lastLoad.current = Date.now();
    api<AdminParticipant[]>(`/admin/events/${event.id}/participants`)
      .then((list) => {
        setPeople(list);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [event.id]);

  // Bei jeder Live-Änderung neu laden, aber gedrosselt.
  useEffect(() => {
    const wait = Math.max(0, lastLoad.current + REFRESH_MS - Date.now());
    const timer = setTimeout(load, wait);
    return () => clearTimeout(timer);
  }, [live.data, load]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const url = `/admin/events/${event.id}/participants/${pending.id}`;
      setPeople(
        await api<AdminParticipant[]>(pending.kind === "reset" ? `${url}/reset-selfie` : url, {
          method: pending.kind === "reset" ? "POST" : "DELETE",
        }),
      );
      setPending(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!people) return error ? <Alert>{error}</Alert> : <Spinner className="text-slate-400" />;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-1 text-sm text-slate-600">
        <p>
          Teilnehmende sind anonym und nach Beitritt nummeriert. Bei einem unpassenden Selfie kannst du ein
          neues verlangen (die Person fotografiert neu) oder die Person entfernen. In beiden Fällen wird das
          Foto sofort gelöscht, und ein laufendes Match löst sich auf.
        </p>
      </Card>
      {error && <Alert>{error}</Alert>}
      {people.length === 0 ? (
        <p className="text-sm text-slate-500">Noch niemand beigetreten.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <ParticipantCard
              key={person.id}
              person={person}
              pending={pending?.id === person.id ? pending.kind : null}
              busy={busy}
              onAsk={(kind) => setPending({ id: person.id, kind })}
              onCancel={() => setPending(null)}
              onConfirm={() => void confirm()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
