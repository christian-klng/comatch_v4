import { useEffect, useState } from "react";
import type { EventControlAction, EventDetail, EventLive } from "@comatch/shared";
import { Button, Card, cx } from "../../components/ui.tsx";
import { api, errorMessage } from "../../lib/api.ts";
import { formatCountdown, useLive, useRemaining } from "../../lib/live.ts";

function Stat({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <span className={cx("whitespace-nowrap", muted ? "text-slate-400" : "text-slate-600")}>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span> {label}
    </span>
  );
}

/**
 * Status und Steuerung eines Events: Beitritt öffnen, Start, Pause, nächste Runde, Ende.
 * Zahlen und Countdown kommen live per Socket.IO.
 */
export function EventControls({
  event,
  onChanged,
}: {
  event: EventDetail;
  onChanged: (e: EventDetail) => void;
}) {
  const live = useLive<EventLive>({ role: "admin", eventId: event.id }, "event_state");
  const clock = live.data?.clock;
  const remaining = useRemaining(clock?.roundEndsAt ?? null, live.offsetMs);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Status hat sich live geändert (z. B. durch eine andere Person im Team): Details neu laden.
  const liveStatus = clock?.status;
  useEffect(() => {
    if (!liveStatus || liveStatus === event.status) return;
    api<EventDetail>(`/admin/events/${event.id}`)
      .then(onChanged)
      .catch(() => {});
  }, [liveStatus, event.status, event.id, onChanged]);

  const act = async (key: string, request: () => Promise<EventDetail>) => {
    setBusy(key);
    setError(null);
    try {
      onChanged(await request());
      setConfirmEnd(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const control = (action: EventControlAction) =>
    act(action, () =>
      api<EventDetail>(`/admin/events/${event.id}/control`, { method: "POST", body: { action } }),
    );
  const setJoinable = (open: boolean) =>
    act("status", () =>
      api<EventDetail>(`/admin/events/${event.id}/status`, {
        method: "PUT",
        body: { status: open ? "open" : "draft" },
      }),
    );

  const status = event.status;
  const counts = live.data?.counts;
  const headline = {
    draft: "Entwurf: Beitritt noch geschlossen",
    open: "Beitritt offen: wartet auf den Start",
    running: `Runde ${clock?.round ?? "–"} · noch ${formatCountdown(remaining)}`,
    paused: `Runde ${clock?.round ?? "–"} pausiert · ${formatCountdown(clock?.pausedRemainingMs ?? null)} übrig`,
    ended: "Event beendet",
  }[status];

  return (
    <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-lg font-semibold tabular-nums">
          {status === "running" && (
            <span className="size-2.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
          )}
          {headline}
        </p>
        {status !== "draft" && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {counts ? (
              <>
                <Stat value={counts.joined} label="dabei" />
                <Stat value={counts.matched + counts.confirmed} label="im Match" />
                <Stat value={counts.waiting} label="warten" />
                {counts.inactive > 0 && <Stat value={counts.inactive} label="inaktiv" muted />}
              </>
            ) : (
              <span className="text-slate-400">{live.connected ? "Lade Zahlen …" : "Verbinde …"}</span>
            )}
          </p>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {confirmEnd ? (
          <>
            <span className="self-center text-sm text-slate-600">Event wirklich beenden?</span>
            <Button variant="danger" busy={busy === "end"} onClick={() => void control("end")}>
              Ja, beenden
            </Button>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              Abbrechen
            </Button>
          </>
        ) : (
          <>
            {status === "draft" && (
              <Button busy={busy === "status"} onClick={() => void setJoinable(true)}>
                Beitritt öffnen
              </Button>
            )}
            {status === "open" && (
              <>
                <Button
                  variant="secondary"
                  busy={busy === "status"}
                  disabled={event.participantCount > 0}
                  title={event.participantCount > 0 ? "Es sind schon Personen beigetreten." : undefined}
                  onClick={() => void setJoinable(false)}
                >
                  Zurück zum Entwurf
                </Button>
                <Button busy={busy === "start"} onClick={() => void control("start")}>
                  Event starten
                </Button>
              </>
            )}
            {status === "running" && (
              <>
                <Button variant="secondary" busy={busy === "pause"} onClick={() => void control("pause")}>
                  Pause
                </Button>
                <Button
                  variant="secondary"
                  busy={busy === "next_round"}
                  onClick={() => void control("next_round")}
                >
                  Nächste Runde
                </Button>
              </>
            )}
            {status === "paused" && (
              <Button busy={busy === "resume"} onClick={() => void control("resume")}>
                Fortsetzen
              </Button>
            )}
            {(status === "open" || status === "running" || status === "paused") && (
              <Button variant="danger" onClick={() => setConfirmEnd(true)}>
                Beenden
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
