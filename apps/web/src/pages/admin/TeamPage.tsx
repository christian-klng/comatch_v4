import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminListItem, InviteCreated, InviteListItem } from "@comatch/shared";
import { Alert, Button, Card, Field, Input, Spinner } from "../../components/ui.tsx";
import { api, ApiError, errorMessage } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { formatDate } from "../../lib/format.ts";
import { useClipboard } from "../../lib/useClipboard.ts";

interface Team {
  admins: AdminListItem[];
  invites: InviteListItem[];
}

function InviteForm({ onCreated }: { onCreated: (invite: InviteCreated) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await api<InviteCreated>("/admin/invites", { method: "POST", body: { email } }));
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Admin einladen"
        htmlFor="invite-email"
        hint="Du bekommst einen Einladungslink, den du selbst weitergibst. Er ist 7 Tage gültig."
        error={error?.issues.email ?? (error && !error.issues.email ? error.message : undefined)}
      >
        <div className="flex gap-2">
          <Input
            id="invite-email"
            type="email"
            required
            placeholder="name@beispiel.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" busy={busy}>
            Einladen
          </Button>
        </div>
      </Field>
    </form>
  );
}

export function TeamPage() {
  const { admin: me } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<InviteCreated | null>(null);
  const { copy, copied } = useClipboard();

  const load = useCallback(() => {
    api<Team>("/admin/team")
      .then(setTeam)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Team</h1>
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <InviteForm
            onCreated={(invite) => {
              setCreated(invite);
              load();
            }}
          />
          {created && (
            <Alert tone="info">
              <p className="mb-2">
                Einladung für <strong>{created.email}</strong> erstellt. Kopiere den Link jetzt, er wird nur
                einmal angezeigt:
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={created.acceptUrl}
                  className="font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button variant="secondary" onClick={() => void copy(created.acceptUrl)}>
                  {copied === created.acceptUrl ? "Kopiert ✓" : "Kopieren"}
                </Button>
              </div>
            </Alert>
          )}
        </Card>

        {error && <Alert>{error}</Alert>}
        {!team && !error && <Spinner className="text-slate-400" />}

        {team && (
          <Card flush className="overflow-hidden">
            <h2 className="border-b border-slate-200 px-6 py-3 font-semibold">Admins</h2>
            <ul className="divide-y divide-slate-100">
              {team.admins.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {a.email}{" "}
                      {a.id === me?.id && <span className="text-sm font-normal text-slate-500">(du)</span>}
                    </div>
                    <div className="text-sm text-slate-500">
                      seit {formatDate(a.createdAt)}
                      {a.invitedByEmail && ` · eingeladen von ${a.invitedByEmail}`}
                    </div>
                  </div>
                  {a.id !== me?.id && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        window.confirm(`${a.email} als Admin entfernen?`) &&
                        void act(() => api(`/admin/admins/${a.id}`, { method: "DELETE" }))
                      }
                    >
                      Entfernen
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {team.invites.length > 0 && (
              <>
                <h2 className="border-y border-slate-200 px-6 py-3 font-semibold">Offene Einladungen</h2>
                <ul className="divide-y divide-slate-100">
                  {team.invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-4 px-6 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{i.email}</div>
                        <div className="text-sm text-slate-500">gültig bis {formatDate(i.expiresAt)}</div>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => void act(() => api(`/admin/invites/${i.id}`, { method: "DELETE" }))}
                      >
                        Zurückziehen
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
