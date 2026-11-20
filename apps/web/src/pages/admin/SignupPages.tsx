import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { MIN_PASSWORD_LENGTH, type AdminMe } from "@comatch/shared";
import { Alert, Button, Field, Input, Spinner } from "../../components/ui.tsx";
import { api, ApiError, errorMessage } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { usePublicConfig } from "../../lib/publicConfig.ts";
import { AuthShell } from "./AuthShell.tsx";

const linkClass = "text-center text-sm text-slate-500 hover:text-slate-900";

/** /admin/signup */
export function SignupPage() {
  const { admin } = useAuth();
  const config = usePublicConfig();
  const [accountName, setAccountName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (admin) return <Navigate to="/admin" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/signup", { method: "POST", body: { accountName, email, password, acceptTerms } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const issues = error?.issues ?? {};
  const generalError = error && Object.keys(issues).length === 0 ? error.message : null;
  const login = (
    <Link to="/admin/login" className={linkClass}>
      Schon ein Konto? Anmelden
    </Link>
  );

  return (
    <AuthShell title="Konto anlegen">
      {!config && <Spinner className="text-slate-400" />}
      {config && !config.signupOpen && (
        <div className="flex flex-col gap-4">
          <Alert tone="info">Neue Konten gibt es zurzeit nur auf Einladung.</Alert>
          {login}
        </div>
      )}
      {config?.signupOpen && sent && (
        <div className="flex flex-col gap-4">
          <Alert tone="info">
            Fast geschafft: Wir haben eine Mail an <strong>{email}</strong> geschickt. Öffne den Link darin,
            um dein Konto zu bestätigen. Er ist 24 Stunden gültig. Schau auch im Spam-Ordner nach.
          </Alert>
          <p className="text-sm text-slate-500">
            Keine Mail bekommen? Vielleicht gibt es zu dieser Adresse schon ein Konto. Dann hilft{" "}
            <Link to="/admin/forgot" className="underline">
              Passwort vergessen
            </Link>
            .
          </p>
          {login}
        </div>
      )}
      {config?.signupOpen && !sent && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {generalError && <Alert>{generalError}</Alert>}
          <Field
            label="Name des Kontos"
            htmlFor="account-name"
            hint="Zum Beispiel der Name deiner Organisation."
            error={issues.accountName}
          >
            <Input
              id="account-name"
              autoFocus
              required
              maxLength={100}
              autoComplete="organization"
              invalid={Boolean(issues.accountName)}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </Field>
          <Field label="E-Mail" htmlFor="email" error={issues.email}>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              invalid={Boolean(issues.email)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            label="Passwort"
            htmlFor="password"
            hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`}
            error={issues.password}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              invalid={Boolean(issues.password)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              required
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-brand"
            />
            <span>
              Ich stimme den{" "}
              <a href="/nutzungsbedingungen" target="_blank" rel="noreferrer" className="underline">
                Nutzungsbedingungen
              </a>{" "}
              und dem{" "}
              <a href="/av-vertrag" target="_blank" rel="noreferrer" className="underline">
                Vertrag zur Auftragsverarbeitung
              </a>{" "}
              zu.
            </span>
          </label>
          {issues.acceptTerms && <p className="text-sm text-rose-600">{issues.acceptTerms}</p>}
          <Button type="submit" busy={busy} className="mt-2">
            Konto anlegen
          </Button>
          {login}
        </form>
      )}
    </AuthShell>
  );
}

// Je Link nur eine Anfrage, auch wenn React die Seite in der Entwicklung doppelt aufbaut:
// Der Link gilt nur einmal, ein zweiter Versuch würde scheitern.
const verifications = new Map<string, Promise<AdminMe>>();

/** /admin/verify/:token: bestätigt die E-Mail und meldet an. */
export function VerifyEmailPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { setAdmin } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let request = verifications.get(token);
    if (!request) {
      request = api<AdminMe>(`/auth/verify/${encodeURIComponent(token)}`, { method: "POST" });
      verifications.set(token, request);
    }
    let active = true;
    request
      .then((admin) => {
        if (!active) return;
        setAdmin(admin);
        navigate("/admin", { replace: true });
      })
      .catch((err: unknown) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [token, navigate, setAdmin]);

  return (
    <AuthShell title="E-Mail bestätigen">
      {!error && <Spinner className="text-slate-400" />}
      {error && (
        <div className="flex flex-col gap-4">
          <Alert>{error}</Alert>
          <Link to="/admin/login" className={linkClass}>
            Zur Anmeldung
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
