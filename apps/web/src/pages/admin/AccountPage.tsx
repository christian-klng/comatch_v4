import { useEffect, useState, type FormEvent } from "react";
import type { AccountDetail } from "@comatch/shared";
import { Alert, Button, Card, Field, Input, Spinner, Textarea } from "../../components/ui.tsx";
import { api, ApiError, errorMessage } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";

/** /admin/account: Name des Kontos und Angaben zum Veranstalter. Ändern darf nur die*der Inhaber*in. */
export function AccountPage() {
  const { admin: me, setAdmin } = useAuth();
  const canEdit = me?.role === "owner";
  const [form, setForm] = useState<AccountDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<AccountDetail>("/admin/account")
      .then(setForm)
      .catch((err: unknown) => setLoadError(errorMessage(err)));
  }, []);

  const set = (patch: Partial<AccountDetail>) => {
    setSaved(false);
    setForm((current) => current && { ...current, ...patch });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const { id: _id, ...body } = form;
      const next = await api<AccountDetail>("/admin/account", { method: "PUT", body });
      setForm(next);
      setSaved(true);
      // Der Name steht auch in der Kopfzeile.
      if (me) setAdmin({ ...me, accountName: next.name });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const issues = error?.issues ?? {};
  const generalError = error && Object.keys(issues).length === 0 ? error.message : null;

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Konto</h1>
      {loadError && <Alert>{loadError}</Alert>}
      {!form && !loadError && <Spinner className="text-slate-400" />}
      {form && (
        <form onSubmit={submit} className="flex flex-col gap-6">
          {!canEdit && (
            <Alert tone="info">Diese Angaben kann nur die*der Inhaber*in des Kontos ändern.</Alert>
          )}
          {generalError && <Alert>{generalError}</Alert>}
          <Card className="flex flex-col gap-4">
            <Field
              label="Name des Kontos"
              htmlFor="account-name"
              hint="Zum Beispiel der Name eurer Organisation. Nur für euer Team sichtbar."
              error={issues.name}
            >
              <Input
                id="account-name"
                required
                maxLength={100}
                disabled={!canEdit}
                invalid={Boolean(issues.name)}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
          </Card>

          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold">Veranstalter</h2>
              <p className="mt-1 text-sm text-slate-500">
                Wer eure Events veranstaltet und für die Daten der Teilnehmenden verantwortlich ist.
              </p>
            </div>
            <Field label="Name oder Firma" htmlFor="legal-name" error={issues.legalName}>
              <Input
                id="legal-name"
                maxLength={200}
                disabled={!canEdit}
                value={form.legalName ?? ""}
                onChange={(e) => set({ legalName: e.target.value })}
              />
            </Field>
            <Field label="Anschrift" htmlFor="legal-address" error={issues.legalAddress}>
              <Textarea
                id="legal-address"
                rows={3}
                maxLength={500}
                disabled={!canEdit}
                value={form.legalAddress ?? ""}
                onChange={(e) => set({ legalAddress: e.target.value })}
              />
            </Field>
            <Field label="E-Mail für Anfragen" htmlFor="legal-email" error={issues.legalEmail}>
              <Input
                id="legal-email"
                type="email"
                placeholder="kontakt@beispiel.de"
                disabled={!canEdit}
                invalid={Boolean(issues.legalEmail)}
                value={form.legalEmail ?? ""}
                onChange={(e) => set({ legalEmail: e.target.value })}
              />
            </Field>
          </Card>

          {canEdit && (
            <div className="flex items-center gap-3">
              <Button type="submit" busy={busy}>
                Speichern
              </Button>
              {saved && <span className="text-sm text-slate-500">Gespeichert ✓</span>}
            </div>
          )}
        </form>
      )}
    </>
  );
}
