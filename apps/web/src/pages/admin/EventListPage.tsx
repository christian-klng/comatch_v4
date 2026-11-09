import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  type EventDetail,
  type EventSummary,
  type Language,
} from "@comatch/shared";
import { Alert, Button, Card, Field, Input, Select, Spinner, StatusBadge } from "../../components/ui.tsx";
import { LANGUAGE_LABELS } from "../../i18n/index.tsx";
import { api, ApiError, errorMessage } from "../../lib/api.ts";
import { formatDate, formatDateTime, fromLocalInput } from "../../lib/format.ts";

function NewEventForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<EventDetail>("/admin/events", {
        method: "POST",
        body: { title, startsAt: fromLocalInput(startsAt), language },
      });
      navigate(`/admin/events/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: errorMessage(err) }));
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="font-semibold">Neues Event</h2>
        {error && !error.issues.title && <Alert>{error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Titel" htmlFor="new-title" error={error?.issues.title}>
            <Input
              id="new-title"
              autoFocus
              required
              maxLength={100}
              placeholder="z. B. Founders Night Berlin"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Beginn (optional)" htmlFor="new-starts">
            <Input
              id="new-starts"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Sprache" htmlFor="new-language">
            <Select
              id="new-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-sm text-slate-500">
          Das Event startet mit drei Beispielfragen in der gewählten Sprache, die du danach anpassen kannst.
          Die Sprache bestimmt, was Teilnehmende und die Leinwand sehen.
        </p>
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>
            Event anlegen
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function EventListPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<EventSummary[]>("/admin/events")
      .then(setEvents)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        {!creating && <Button onClick={() => setCreating(true)}>+ Neues Event</Button>}
      </div>

      {creating && <NewEventForm onCancel={() => setCreating(false)} />}
      {error && <Alert>{error}</Alert>}
      {!events && !error && <Spinner className="text-slate-400" />}

      {events?.length === 0 && !creating && (
        <Card className="text-center">
          <p className="text-slate-600">Noch keine Events. Leg das erste an!</p>
        </Card>
      )}

      {events && events.length > 0 && (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                to={`/admin/events/${event.id}`}
                className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{event.title}</span>
                    <StatusBadge status={event.status} />
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {event.startsAt
                      ? formatDateTime(event.startsAt)
                      : `angelegt am ${formatDate(event.createdAt)}`}
                    {" · "}
                    <span className="font-mono">/e/{event.slug}</span>
                  </div>
                </div>
                <div className="text-right text-sm text-slate-500">
                  <div className="text-lg font-semibold text-slate-900">{event.participantCount}</div>
                  Teilnehmende
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
