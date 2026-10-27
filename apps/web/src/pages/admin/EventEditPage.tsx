import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  LOGO_MAX_BYTES,
  IMAGE_MIME_TYPES,
  MAX_ROUND_DURATION_S,
  MIN_ROUND_DURATION_S,
  questionsInput,
  type EventDetail,
  type EventGeneralInput,
  type QuestionInput,
} from "@comatch/shared";
import { downloadQrPng, downloadQrSvg, QrCode } from "../../components/QrCode.tsx";
import { QuestionsEditor } from "../../components/QuestionsEditor.tsx";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  SaveState,
  Select,
  Spinner,
  StatusBadge,
  cx,
} from "../../components/ui.tsx";
import { api, ApiError, errorMessage } from "../../lib/api.ts";
import { fromLocalInput, toLocalInput } from "../../lib/format.ts";
import { useClipboard } from "../../lib/useClipboard.ts";
import { EventControls } from "./EventControls.tsx";

const DEFAULT_BRAND = "#6366f1";
const ROUND_MINUTES = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15].filter(
  (m) => m * 60 >= MIN_ROUND_DURATION_S && m * 60 <= MAX_ROUND_DURATION_S,
);

type TabProps = { event: EventDetail; onSaved: (event: EventDetail) => void };

const generalOf = (e: EventDetail): EventGeneralInput => ({
  title: e.title,
  startsAt: e.startsAt,
  roundDurationS: e.roundDurationS,
  firstMatchDelayS: e.firstMatchDelayS,
  primaryColor: e.primaryColor,
});

/** Gemeinsame Logik für Formulare mit Speichern-Button. */
function useSaver<T>(saveFn: (value: T) => Promise<EventDetail>, onSaved: (e: EventDetail) => void) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const save = async (value: T) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveFn(value));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { message: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };
  return { busy, saved, setSaved, error, save };
}

// ---------------------------------------------------------------------------
// Tab: Einstellungen
// ---------------------------------------------------------------------------

function GeneralTab({ event, onSaved }: TabProps) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    ...generalOf(event),
    startsLocal: toLocalInput(event.startsAt),
  }));
  const saver = useSaver(
    (value: EventGeneralInput) =>
      api<EventDetail>(`/admin/events/${event.id}`, { method: "PUT", body: value }),
    onSaved,
  );
  const { startsLocal, ...rest } = form;
  const value: EventGeneralInput = { ...rest, startsAt: fromLocalInput(startsLocal) };
  const dirty = JSON.stringify(value) !== JSON.stringify(generalOf(event));
  const issues = saver.error?.issues ?? {};
  const update = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    saver.setSaved(false);
  };

  const remove = async () => {
    if (!window.confirm(`„${event.title}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
    try {
      await api(`/admin/events/${event.id}`, { method: "DELETE" });
      navigate("/admin", { replace: true });
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void saver.save(value);
          }}
        >
          {saver.error && Object.keys(issues).length === 0 && <Alert>{saver.error.message}</Alert>}
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <Field label="Titel" htmlFor="title" error={issues.title}>
              <Input
                id="title"
                required
                maxLength={100}
                value={form.title}
                invalid={!!issues.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </Field>
            <Field label="Beginn" htmlFor="startsAt" hint="Optional, nur zur Übersicht.">
              <Input
                id="startsAt"
                type="datetime-local"
                value={form.startsLocal}
                onChange={(e) => update({ startsLocal: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Dauer einer Matching-Runde"
              htmlFor="roundDuration"
              hint="Danach bekommen alle ein neues Match."
              error={issues.roundDurationS}
            >
              <Select
                id="roundDuration"
                value={form.roundDurationS}
                onChange={(e) => update({ roundDurationS: Number(e.target.value) })}
              >
                {!ROUND_MINUTES.includes(form.roundDurationS / 60) && (
                  <option value={form.roundDurationS}>{form.roundDurationS} Sekunden</option>
                )}
                {ROUND_MINUTES.map((m) => (
                  <option key={m} value={m * 60}>
                    {m} Minuten
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Wartezeit bis zum ersten Match"
              htmlFor="firstMatchDelay"
              hint="Für alle, die während einer laufenden Runde dazukommen."
              error={issues.firstMatchDelayS}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="firstMatchDelay"
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  className="w-24"
                  value={form.firstMatchDelayS}
                  invalid={!!issues.firstMatchDelayS}
                  onChange={(e) => update({ firstMatchDelayS: Number(e.target.value) })}
                />
                <span className="text-sm text-slate-600">Sekunden</span>
              </div>
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" busy={saver.busy} disabled={!dirty}>
              Speichern
            </Button>
            <SaveState dirty={dirty} saved={saver.saved} />
          </div>
        </form>
      </Card>

      <Card className="ring-rose-200">
        <h2 className="font-semibold text-rose-700">Event löschen</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          Löscht das Event mit allen Fragen, Teilnehmenden und Matches endgültig.
        </p>
        <Button variant="danger" onClick={() => void remove()}>
          Event löschen
        </Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Fragen
// ---------------------------------------------------------------------------

function clientIssues(questions: QuestionInput[]): Record<string, string> {
  const result = questionsInput.safeParse(questions);
  if (result.success) return {};
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) issues[issue.path.join(".")] ??= issue.message;
  return issues;
}

function QuestionsTab({ event, onSaved }: TabProps) {
  const [questions, setQuestions] = useState(event.questions);
  const [showIssues, setShowIssues] = useState(false);
  const saver = useSaver(
    (value: QuestionInput[]) =>
      api<EventDetail>(`/admin/events/${event.id}/questions`, { method: "PUT", body: value }),
    (saved) => {
      onSaved(saved);
      setQuestions(saved.questions);
    },
  );
  const dirty = JSON.stringify(questions) !== JSON.stringify(event.questions);
  const localIssues = clientIssues(questions);
  const issues = showIssues ? { ...localIssues, ...(saver.error?.issues ?? {}) } : {};

  const submit = () => {
    if (Object.keys(localIssues).length > 0) {
      setShowIssues(true);
      return;
    }
    void saver.save(questions);
  };

  return (
    <div className="flex flex-col gap-4">
      {event.questionsLocked ? (
        <Alert tone="warning">
          Es sind bereits Teilnehmende beigetreten. Die Fragen lassen sich deshalb nicht mehr ändern, sonst
          passen die gegebenen Antworten nicht mehr.
        </Alert>
      ) : (
        <p className="text-sm text-slate-600">
          Teilnehmende beantworten diese drei Fragen nach dem Scannen des QR-Codes. Danach werden Personen mit
          passenden Antworten zusammengebracht.
        </p>
      )}
      {saver.error && Object.keys(saver.error.issues).length === 0 && <Alert>{saver.error.message}</Alert>}

      <QuestionsEditor
        questions={questions}
        issues={issues}
        disabled={event.questionsLocked}
        onChange={(q) => {
          setQuestions(q);
          saver.setSaved(false);
        }}
      />

      {!event.questionsLocked && (
        <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
          <Button busy={saver.busy} disabled={!dirty} onClick={submit}>
            Fragen speichern
          </Button>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuestions(event.questions);
                setShowIssues(false);
              }}
            >
              Verwerfen
            </Button>
          )}
          <SaveState dirty={dirty} saved={saver.saved} />
          {showIssues && Object.keys(localIssues).length > 0 && (
            <span className="text-sm text-rose-600">Bitte die markierten Felder ausfüllen.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Branding
// ---------------------------------------------------------------------------

function BrandingPreview({
  title,
  color,
  logoUrl,
}: {
  title: string;
  color: string;
  logoUrl: string | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Leinwand</p>
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg bg-slate-950 p-4 text-white">
          {logoUrl && <img src={logoUrl} alt="" className="max-h-10 max-w-[40%] object-contain" />}
          <p className="text-center text-sm font-semibold">{title}</p>
          <p className="font-mono text-4xl font-bold tabular-nums" style={{ color }}>
            04:59
          </p>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Handy</p>
        <div className="mx-auto flex aspect-[9/16] max-h-56 flex-col items-center justify-end gap-2 rounded-2xl bg-slate-900 p-3 ring-4 ring-slate-300">
          {logoUrl && <img src={logoUrl} alt="" className="mb-auto max-h-6 object-contain" />}
          <div className="h-2 w-3/4 rounded bg-slate-700" />
          <div className="h-2 w-1/2 rounded bg-slate-700" />
          <div
            className="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-semibold text-white"
            style={{ background: color }}
          >
            Weiter
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandingTab({ event, onSaved }: TabProps) {
  const [color, setColor] = useState<string | null>(event.primaryColor);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saver = useSaver(
    (primaryColor: string | null) =>
      api<EventDetail>(`/admin/events/${event.id}`, {
        method: "PUT",
        body: { ...generalOf(event), primaryColor },
      }),
    onSaved,
  );
  const dirty = color !== event.primaryColor;

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      setLogoError("Bitte ein PNG-, JPEG- oder WebP-Bild wählen.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError(`Das Bild ist zu groß (max. ${LOGO_MAX_BYTES / 1024} KB).`);
      return;
    }
    setLogoBusy(true);
    try {
      onSaved(await api<EventDetail>(`/admin/events/${event.id}/logo`, { method: "PUT", body: file }));
    } catch (err) {
      setLogoError(errorMessage(err));
    } finally {
      setLogoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      onSaved(await api<EventDetail>(`/admin/events/${event.id}/logo`, { method: "DELETE" }));
    } catch (err) {
      setLogoError(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="flex flex-col gap-6">
        <Field
          label="Logo"
          hint="PNG, JPEG oder WebP, max. 512 KB. Am besten mit transparentem Hintergrund."
          error={logoError ?? undefined}
        >
          <div className="flex items-center gap-4">
            <div className="flex size-20 items-center justify-center rounded-lg bg-slate-900 p-2">
              {event.logoUrl ? (
                <img src={event.logoUrl} alt="Event-Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-500">kein Logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={IMAGE_MIME_TYPES.join(",")}
                className="hidden"
                onChange={(e) => void uploadLogo(e.target.files?.[0])}
              />
              <Button variant="secondary" busy={logoBusy} onClick={() => fileInput.current?.click()}>
                {event.logoUrl ? "Logo ersetzen" : "Logo hochladen"}
              </Button>
              {event.logoUrl && (
                <Button variant="ghost" disabled={logoBusy} onClick={() => void removeLogo()}>
                  Entfernen
                </Button>
              )}
            </div>
          </div>
        </Field>

        <Field
          label="Primärfarbe"
          hint="Für Countdown, Buttons und Animationen."
          error={saver.error?.issues.primaryColor}
        >
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Farbe wählen"
              className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              value={color ?? DEFAULT_BRAND}
              onChange={(e) => {
                setColor(e.target.value);
                saver.setSaved(false);
              }}
            />
            <Input
              aria-label="Farbe als Hex-Wert"
              className="w-28 font-mono"
              value={color ?? ""}
              placeholder={DEFAULT_BRAND}
              onChange={(e) => {
                setColor(e.target.value || null);
                saver.setSaved(false);
              }}
            />
            {color && (
              <Button variant="ghost" onClick={() => setColor(null)}>
                Standard
              </Button>
            )}
          </div>
        </Field>
        <div className="flex items-center gap-3">
          <Button busy={saver.busy} disabled={!dirty} onClick={() => void saver.save(color)}>
            Farbe speichern
          </Button>
          <SaveState dirty={dirty} saved={saver.saved} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Vorschau</h2>
        <BrandingPreview
          title={event.title}
          color={color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_BRAND}
          logoUrl={event.logoUrl}
        />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: QR-Code & Links
// ---------------------------------------------------------------------------

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { copy, copied } = useClipboard();
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button variant="secondary" onClick={() => void copy(value)}>
          {copied === value ? "Kopiert ✓" : "Kopieren"}
        </Button>
      </div>
    </Field>
  );
}

function LinksTab({ event, onSaved }: TabProps) {
  const [rotating, setRotating] = useState(false);
  const isLocal = /\/\/(localhost|127\.0\.0\.1)/.test(event.joinUrl);
  const filename = `comatch-${event.slug}-qr`;

  const rotate = async () => {
    if (
      !window.confirm("Neuen Präsentationslink erzeugen? Der bisherige Link funktioniert danach nicht mehr.")
    )
      return;
    setRotating(true);
    try {
      onSaved(await api<EventDetail>(`/admin/events/${event.id}/presenter-token`, { method: "POST" }));
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <Card className="flex flex-col items-center gap-4">
        <QrCode value={event.joinUrl} className="w-64 [&_svg]:h-auto [&_svg]:w-full" />
        <p className="font-mono text-sm text-slate-600">{event.joinUrl.replace(/^https?:\/\//, "")}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void downloadQrPng(event.joinUrl, `${filename}.png`)}>
            PNG
          </Button>
          <Button variant="secondary" onClick={() => void downloadQrSvg(event.joinUrl, `${filename}.svg`)}>
            SVG
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        {isLocal && (
          <Alert tone="warning">
            Der Link zeigt auf <code>localhost</code> und funktioniert nicht auf Handys. Für Tests im WLAN{" "}
            <code>PUBLIC_BASE_URL</code> in der <code>.env</code> auf die Netzwerk-Adresse dieses Rechners
            setzen.
          </Alert>
        )}
        <Card className="flex flex-col gap-5">
          <CopyField
            label="Teilnahme-Link"
            value={event.joinUrl}
            hint="Steckt im QR-Code. Teilnehmende brauchen kein Konto."
          />
        </Card>
        <Card className="flex flex-col gap-5">
          <CopyField
            label="Präsentationslink"
            value={event.presenterUrl}
            hint="Für den Rechner am Beamer, funktioniert ohne Login. Nicht öffentlich teilen."
          />
          <div className="flex flex-wrap gap-2">
            <a
              href={event.presenterUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90"
            >
              Präsentation öffnen ↗
            </a>
            <Button variant="ghost" busy={rotating} onClick={() => void rotate()}>
              Neuen Link erzeugen
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TABS = [
  { id: "general", label: "Einstellungen", Component: GeneralTab },
  { id: "questions", label: "Fragen", Component: QuestionsTab },
  { id: "branding", label: "Branding", Component: BrandingTab },
  { id: "links", label: "QR-Code & Links", Component: LinksTab },
] as const;

export function EventEditPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tab = TABS.find((t) => t.id === params.get("tab")) ?? TABS[0];

  useEffect(() => {
    api<EventDetail>(`/admin/events/${id}`)
      .then(setEvent)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!event) return <Spinner className="text-slate-400" />;

  return (
    <>
      <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-900">
        ← Alle Events
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <StatusBadge status={event.status} />
        <span className="text-sm text-slate-500">
          {event.participantCount} Teilnehmende · Code <span className="font-mono">{event.slug}</span>
        </span>
      </div>

      <EventControls event={event} onChanged={setEvent} />

      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === tab.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cx(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap",
              t.id === tab.id
                ? "border-brand text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* key: Formulare beim Tabwechsel mit dem aktuellen Stand neu initialisieren */}
      <tab.Component key={tab.id} event={event} onSaved={setEvent} />
    </>
  );
}
