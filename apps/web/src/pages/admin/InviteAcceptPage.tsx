import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import type { AdminMe, InvitePreview } from "@comatch/shared";
import { Alert, Button, Field, Input, Spinner } from "../../components/ui.tsx";
import { api, ApiError, errorMessage } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { AuthShell } from "./AuthShell.tsx";

const MIN_LENGTH = 10;

export function InviteAcceptPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { setAdmin } = useAuth();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<InvitePreview>(`/invites/${encodeURIComponent(token)}`)
      .then(setInvite)
      .catch((err: unknown) => setLoadError(errorMessage(err)));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const admin = await api<AdminMe>(`/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: { password },
      });
      setAdmin(admin);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues.password ?? err.message) : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Einladung annehmen">
      {loadError && <Alert>{loadError}</Alert>}
      {!invite && !loadError && <Spinner className="text-slate-400" />}
      {invite && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Du wurdest als Admin zu CoMatch eingeladen. Leg ein Passwort für <strong>{invite.email}</strong>{" "}
            fest.
          </p>
          {error && <Alert>{error}</Alert>}
          <input type="email" autoComplete="username" value={invite.email} readOnly hidden />
          <Field label="Passwort" htmlFor="password" hint={`Mindestens ${MIN_LENGTH} Zeichen.`}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Passwort wiederholen" htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Button type="submit" busy={busy} className="mt-2">
            Konto anlegen
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
