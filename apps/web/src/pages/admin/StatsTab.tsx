import { useCallback, useEffect, useState } from "react";
import type { EventDetail, EventStats } from "@comatch/shared";
import { Alert, Button, Card, Spinner } from "../../components/ui.tsx";
import { api, errorMessage } from "../../lib/api.ts";

const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)} %`);
const decimal = (value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 1 });

function Tile({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-3xl font-semibold text-slate-900 tabular-nums">{value}</p>
      <p className="text-sm text-slate-600">{label}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** Verteilung „bestätigte Matches pro Person“: eine Reihe, Werte direkt an den Balken. */
function Histogram({ data }: { data: EventStats["perPerson"]["histogram"] }) {
  const max = Math.max(1, ...data.map((d) => d.people));
  return (
    <figure>
      <div className="flex h-40 items-end gap-0.5 border-b border-slate-300" role="list">
        {data.map((d) => (
          <div
            key={d.matches}
            role="listitem"
            className="group relative flex h-full flex-1 flex-col justify-end"
            title={`${d.people} ${d.people === 1 ? "Person" : "Personen"} mit ${d.matches} ${d.matches === 1 ? "Match" : "Matches"}`}
          >
            <span className="mb-1 text-center text-xs text-slate-600 tabular-nums">{d.people}</span>
            <div
              className="rounded-t bg-brand transition group-hover:opacity-80"
              style={{ height: `${(d.people / max) * 80}%`, minHeight: d.people > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {data.map((d) => (
          <span key={d.matches} className="flex-1 text-center text-xs text-slate-500 tabular-nums">
            {d.matches}
          </span>
        ))}
      </div>
      <figcaption className="mt-1 text-center text-xs text-slate-500">
        bestätigte Matches pro Person
      </figcaption>
    </figure>
  );
}

/** Statistik und Export: läuft auch während des Events, gedacht für danach. */
export function StatsTab({ event }: { event: EventDetail }) {
  const [stats, setStats] = useState<EventStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<EventStats>(`/admin/events/${event.id}/stats`)
      .then((s) => {
        setStats(s);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [event.id]);

  useEffect(() => {
    // Erste Abfrage nach dem Rendern starten (nicht synchron im Effekt).
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!stats) return error ? <Alert>{error}</Alert> : <Spinner className="text-slate-400" />;
  const { matches, perPerson } = stats;
  const exportUrl = (kind: string) => `/api/admin/events/${event.id}/export/${kind}`;

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert>{error}</Alert>}
      {event.status !== "ended" && (
        <Alert tone="info">Das Event läuft noch; die Zahlen sind ein Zwischenstand.</Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile value={stats.participants} label="Teilnehmende" hint="mit Selfie, ohne Entfernte" />
        <Tile value={stats.rounds} label="Runden" />
        <Tile
          value={matches.confirmed}
          label="bestätigte Matches"
          hint={`von ${matches.total} vermittelten`}
        />
        <Tile
          value={percent(matches.confirmationRate)}
          label="Bestätigungsquote"
          hint={matches.open > 0 ? `ohne ${matches.open} noch offene` : undefined}
        />
        <Tile
          value={decimal(perPerson.average)}
          label="Ø Matches pro Person"
          hint={`Median ${decimal(perPerson.median)}, höchstens ${perPerson.max}`}
        />
        <Tile value={perPerson.withoutMatch} label="ohne bestätigtes Match" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Matches pro Person</h2>
          {stats.participants > 0 ? (
            <Histogram data={perPerson.histogram} />
          ) : (
            <p className="text-sm text-slate-500">Noch keine Daten.</p>
          )}
        </Card>

        <Card flush className="overflow-hidden">
          <h2 className="px-6 pt-6 pb-3 font-semibold">Runden</h2>
          {stats.byRound.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-slate-500">Noch keine Runde gelaufen.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-2 font-medium">Runde</th>
                  <th className="px-3 py-2 text-right font-medium">Matches</th>
                  <th className="px-3 py-2 text-right font-medium">bestätigt</th>
                  <th className="px-6 py-2 text-right font-medium">Quote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {stats.byRound.map((r) => (
                  <tr key={r.round}>
                    <td className="px-6 py-2">{r.round}</td>
                    <td className="px-3 py-2 text-right">{r.matches}</td>
                    <td className="px-3 py-2 text-right">{r.confirmed}</td>
                    <td className="px-6 py-2 text-right">{percent(r.confirmationRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-6 py-3 text-xs text-slate-500">
            Davon für Nachzügler: {stats.byKind.pool.matches} Matches, {stats.byKind.pool.confirmed}{" "}
            bestätigt.
          </p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Export</h2>
          <p className="text-sm text-slate-600">
            CSV für Excel, anonym mit Nummern statt Personen. Ohne Fotos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={loading} onClick={load}>
            Aktualisieren
          </Button>
          <a
            href={exportUrl("matches.csv")}
            className="inline-flex items-center rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90"
          >
            Matches (CSV)
          </a>
          <a
            href={exportUrl("participants.csv")}
            className="inline-flex items-center rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90"
          >
            Teilnehmende (CSV)
          </a>
        </div>
      </Card>
    </div>
  );
}
