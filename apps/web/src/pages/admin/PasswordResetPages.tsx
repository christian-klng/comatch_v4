import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MIN_PASSWORD_LENGTH, type AdminMe } from "@comatch/shared";
import { Alert, Button, Field, Input, Spinner } from "../../components/ui.tsx";
import { api, ApiError, errorMessage } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { AuthShell } from "./AuthShell.tsx";

const backToLogin = (
  <Link to="/admin/login" className="text-center text-sm text-slate-500 hover:text-slate-900">
    Zurück zur Anmeldung
  </Link>
);

/** /admin/forgot */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/forgot", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Passwort vergessen">
      {sent ? (
        <div className="flex flex-col gap-4">
          <Alert tone="info">
            Falls es zu <strong>{email}</strong> ein Konto gibt, ist jetzt eine Mail mit einem Link unterwegs.
            Er ist eine Stunde gültig. Schau auch im Spam-Ordner nach.
          </Alert>
          {backToLogin}
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Gib deine E-Mail ein. Wir schicken dir einen Link, über den du ein neues Passwort festlegst.
          </p>
          {error && <Alert>{error}</Alert>}
          <Field label="E-Mail" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" busy={busy} className="mt-2">
            Link schicken
          </Button>
          {backToLogin}
        </form>
      )}
    </AuthShell>
  );
}

/** /admin/reset/:token */
export function ResetPasswordPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { setAdmin } = useAuth();
  const path = `/auth/reset/${encodeURIComponent(token)}`;
  const [valid, setValid] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(path)
      .then(() => setValid(true))
      .catch((err: unknown) => {
        setValid(false);
        setLoadError(errorMessage(err));
      });
  }, [path]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAdmin(await api<AdminMe>(path, { method: "POST", body: { password } }));
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues.password ?? err.message) : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Neues Passwort">
      {valid === null && <Spinner className="text-slate-400" />}
      {valid === false && (
        <div className="flex flex-col gap-4">
          <Alert>{loadError}</Alert>
          <Link to="/admin/forgot" className="text-center text-sm text-slate-500 hover:text-slate-900">
            Neuen Link anfordern
          </Link>
        </div>
      )}
      {valid && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <Alert>{error}</Alert>}
          <Field
            label="Neues Passwort"
            htmlFor="password"
            hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={MIN_PASSWORD_LENGTH}
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
            Passwort speichern
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
