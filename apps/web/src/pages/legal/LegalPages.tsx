// Impressum und Datenschutzerklärung. Die Betreiber-Angaben kommen aus der Server-Konfiguration
// (LEGAL_*). Der Text der Datenschutzerklärung ist ein Entwurf, der zur App passt; vor dem
// Produktivbetrieb mit einer Datenschutzberatung abstimmen.
import type { Language, LegalInfo } from "@comatch/shared";
import { Spinner } from "../../components/ui.tsx";
import { messagesFor } from "../../i18n/index.tsx";
import { useLegal } from "../../lib/legal.ts";
import { PrivacyEn } from "./PrivacyEn.tsx";
import { Missing, Operator, Section, Shell } from "./parts.tsx";

const STAND = "28.10.2026";
const STAND_EN = "28 October 2026";

export function ImprintPage({ language = "de" }: { language?: Language }) {
  const legal = useLegal();
  const t = messagesFor(language).legal;
  return (
    <Shell language={language} title={t.imprintTitle}>
      {!legal ? (
        <Spinner className="text-slate-400" />
      ) : (
        <>
          {!legal.configured && <Missing language={language} />}
          <Section title={t.imprintOperator}>
            <Operator legal={legal} language={language} />
          </Section>
          <Section title={t.imprintResponsible}>
            <p>
              {legal.name ?? "–"}, {t.sameAddress}
            </p>
          </Section>
        </>
      )}
    </Shell>
  );
}

export function PrivacyPage({ language = "de" }: { language?: Language }) {
  const legal = useLegal();
  const title = messagesFor(language).legal.privacyTitle;
  return (
    <Shell language={language} title={title}>
      {!legal ? (
        <Spinner className="text-slate-400" />
      ) : (
        <>
          {!legal.configured && <Missing language={language} />}
          {language === "en" ? <PrivacyEn legal={legal} /> : <PrivacyDe legal={legal} />}
          <p className="text-sm text-slate-500">
            {language === "en" ? `Last updated: ${STAND_EN}` : `Stand: ${STAND}`}
          </p>
        </>
      )}
    </Shell>
  );
}

function PrivacyDe({ legal }: { legal: LegalInfo }) {
  const hours = legal.retentionHours;
  return (
    <>
      <p>
        CoMatch bringt Teilnehmende einer Veranstaltung für kurze Gespräche zusammen. Die App kommt bewusst
        mit wenigen Daten aus: kein Name, keine E-Mail-Adresse, kein Konto, keine Kontaktdaten und kein
        Tracking.
      </p>

      <Section title="1. Verantwortlich">
        <Operator legal={legal} language="de" />
        {legal.dpo && <p>Datenschutzbeauftragte*r: {legal.dpo}</p>}
      </Section>

      <Section title="2. Welche Daten wir verarbeiten">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Deine Antworten</strong> auf die drei Fragen des Events, damit wir passende
            Gesprächspartner finden.
          </li>
          <li>
            <strong>Dein Selfie</strong>, damit dein Match dich im Raum erkennt.
          </li>
          <li>
            <strong>Spielverlauf:</strong> mit wem du in welcher Runde gematcht wurdest, ob ihr euch bestätigt
            habt, Fehlversuche bei den Codes, Zeitpunkte von Beitritt und letzter Verbindung.
          </li>
          <li>
            <strong>Eine zufällige Sitzungskennung</strong> im Speicher deines Browsers (localStorage), damit
            du nach dem Neuladen weiter mitspielen kannst. Auf dem Server liegt davon nur ein Hash.
          </li>
          <li>
            <strong>Server-Protokolle</strong> ohne IP-Adresse (Zeitpunkt, aufgerufene Adresse, Fehler), damit
            wir den Betrieb sicherstellen können.
          </li>
        </ul>
      </Section>

      <Section title="3. Zweck und Rechtsgrundlage">
        <p>
          Wir verarbeiten Antworten und Selfie, um dir während des Events Gesprächspartner zu vermitteln, dein
          Selfie deinen Matches und bei bestätigten Matches auf der Leinwand zu zeigen und anonyme Statistiken
          für die Veranstalter zu erstellen (zum Beispiel die Zahl der Matches).
        </p>
        <p>
          Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du vor dem Hochladen des
          Selfies gibst. Du kannst sie jederzeit mit „Ich steige aus“ widerrufen. Die Sitzungskennung im
          Browser ist für den Dienst technisch erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Server-Protokolle
          beruhen auf unserem berechtigten Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </Section>

      <Section title="4. Wer deine Daten sieht">
        <ul className="list-disc space-y-1 pl-5">
          <li>Deine Matches: dein Selfie und die Antworten, bei denen ihr zusammenpasst.</li>
          <li>
            Die Leinwand im Saal: dein Selfie, wenn du ein Match bestätigt hast, vor dem Start unter den Neuen
            und am Ende in einer Collage.
          </li>
          <li>
            Die Moderation des Events: Selfie, Antworten und Status, zum Beispiel um ein unpassendes Foto zu
            entfernen.
          </li>
        </ul>
      </Section>

      <Section title="5. Speicherdauer">
        <ul className="list-disc space-y-1 pl-5">
          <li>„Ich steige aus“: Selfie, Antworten und Spielverlauf werden sofort gelöscht.</li>
          <li>
            Nach dem Event: Selfie und Sitzung werden spätestens {hours} Stunden nach Eventende automatisch
            gelöscht.
          </li>
          <li>
            Antworten und Spielverlauf bleiben danach für die Statistik erhalten. Ohne Foto und Sitzung lassen
            sie sich keiner Person mehr zuordnen.
          </li>
          <li>Sicherungskopien der Datenbank (ohne Fotos) werden nach höchstens 7 Tagen überschrieben.</li>
          <li>Server-Protokolle enthalten keine IP-Adressen und werden fortlaufend überschrieben.</li>
        </ul>
      </Section>

      <Section title="6. Hosting und Empfänger">
        <p>
          Server und Bildspeicher betreibt die Hetzner Online GmbH in Deutschland für uns
          (Auftragsverarbeitung nach Art. 28 DSGVO). Eine Übermittlung in Drittländer findet nicht statt. Wir
          geben deine Daten nicht an Dritte weiter und nutzen keine Analyse- oder Werbedienste.
        </p>
      </Section>

      <Section title="7. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch sowie das Recht, deine Einwilligung jederzeit zu widerrufen.
          Weil wir keinen Namen speichern, können wir dich nur über die Sitzung auf deinem Handy erkennen. Am
          einfachsten wendest du dich deshalb noch während des Events an uns oder nutzt „Ich steige aus“.
        </p>
        <p>
          Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel in dem
          Bundesland, in dem du wohnst oder in dem das Event stattfindet.
        </p>
      </Section>
    </>
  );
}
