import { Link } from "react-router";
import { LegalLinks } from "../components/LegalLinks.tsx";
import { usePublicConfig } from "../lib/publicConfig.ts";

const steps = [
  {
    title: "QR-Code scannen",
    text: "Teilnehmende scannen den Code auf der Leinwand. Keine App, kein Konto, kein Name.",
  },
  {
    title: "Drei Fragen, ein Selfie",
    text: "Aus den Antworten entstehen passende Paare. Das Selfie hilft, sich im Raum zu finden.",
  },
  {
    title: "Finden und bestätigen",
    text: "In jeder Runde gibt es ein neues Match. Wer sich gefunden hat, bestätigt es per Code.",
  },
];

const buttonBase = "rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm";

/** Startseite: kurze Erklärung, Anmelden und (wenn freigeschaltet) Konto anlegen. */
export function HomePage() {
  const config = usePublicConfig();
  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-5">
        <span className="text-xl font-semibold tracking-tight">
          Co<span className="text-brand">Match</span>
        </span>
        <Link to="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Anmelden
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16">
        <section className="py-12 sm:py-20">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Live-Matchmaking für dein Event
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">
            CoMatch bringt die Menschen in deinem Raum ins Gespräch: Runde für Runde eine neue passende
            Person, mit Countdown und Live-Animation auf der Leinwand.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {config?.signupOpen && (
              <Link to="/admin/signup" className={`${buttonBase} bg-brand text-white hover:opacity-90`}>
                Konto anlegen
              </Link>
            )}
            <Link
              to="/admin"
              className={`${buttonBase} bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-100`}
            >
              Anmelden
            </Link>
          </div>
        </section>

        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <span className="text-sm font-semibold text-brand">{index + 1}</span>
              <h2 className="mt-2 font-semibold">{step.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </main>

      <LegalLinks className="mx-auto w-full max-w-4xl px-4 pb-8 text-xs text-slate-400" />
    </div>
  );
}
