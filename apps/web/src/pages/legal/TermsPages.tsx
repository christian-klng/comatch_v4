// Nutzungsbedingungen und AV-Vertrag für Konten von Veranstaltern. Beide Seiten sind PLATZHALTER:
// Die Texte kommen von der Rechts- bzw. Datenschutzberatung. Wenn sie eingesetzt sind, TERMS_VERSION
// in packages/shared/src/account.ts auf ein Datum setzen; erst dann lässt sich die Registrierung im
// Produktivbetrieb öffnen (SIGNUP_MODE=open).
import type { ReactNode } from "react";
import { TERMS_DRAFT, TERMS_VERSION } from "@comatch/shared";
import { Section, Shell } from "./parts.tsx";

function Draft({ children }: { children: ReactNode }) {
  return (
    <>
      {TERMS_VERSION === TERMS_DRAFT && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Entwurf: Dieser Text ist noch nicht fertig und gilt nicht. Unten steht nur, was er regeln wird.
        </p>
      )}
      {children}
      <p className="text-sm text-slate-500">Fassung: {TERMS_VERSION}</p>
    </>
  );
}

const Points = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

/** /nutzungsbedingungen */
export function TermsPage() {
  return (
    <Shell language="de" title="Nutzungsbedingungen">
      <Draft>
        <Section title="Was hier geregelt wird">
          <Points
            items={[
              "Wer den Dienst anbietet und für wen er gedacht ist",
              "Konto, Zugangsdaten und Verantwortung für das eigene Team",
              "Erlaubte Nutzung und Grenzen (Events gleichzeitig, Teilnehmende je Event)",
              "Pflichten als Veranstalter gegenüber den Teilnehmenden",
              "Sperrung und Löschung von Konten",
              "Verfügbarkeit, Haftung und Änderungen dieser Bedingungen",
            ]}
          />
        </Section>
      </Draft>
    </Shell>
  );
}

/** /av-vertrag */
export function DpaPage() {
  return (
    <Shell language="de" title="Vertrag zur Auftragsverarbeitung">
      <Draft>
        <Section title="Was hier geregelt wird">
          <Points
            items={[
              "Gegenstand und Dauer: Betrieb von CoMatch für die Events des Veranstalters",
              "Art der Daten: Selfies, Antworten und Spielverlauf der Teilnehmenden",
              "Der Veranstalter ist Verantwortlicher, der Betreiber der Plattform Auftragsverarbeiter (Art. 28 DSGVO)",
              "Weisungen, Vertraulichkeit und technische und organisatorische Maßnahmen",
              "Unterauftragsverarbeiter: Hosting und Mailversand",
              "Löschfristen, Unterstützung bei Betroffenenrechten, Meldung von Vorfällen",
            ]}
          />
        </Section>
      </Draft>
    </Shell>
  );
}
