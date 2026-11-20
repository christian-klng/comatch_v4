// Englische Fassung der Datenschutzerklärung (Übersetzung von PrivacyDe in LegalPages.tsx). Bei
// Änderungen beide Fassungen anpassen und vor dem Einsatz von der Datenschutzberatung prüfen lassen.
import type { LegalInfo, Organizer } from "@comatch/shared";
import { Operator, OrganizerAddress, Section } from "./parts.tsx";

export function PrivacyEn({ legal, organizer }: { legal: LegalInfo; organizer: Organizer | null }) {
  const hours = legal.retentionHours;
  return (
    <>
      <p>
        CoMatch brings participants of an event together for short conversations. The app deliberately
        collects very little data: no name, no email address, no account, no contact details and no tracking.
      </p>

      <Section title="1. Controller">
        {organizer ? (
          <>
            <p>The controller responsible for processing your data is the organizer of this event:</p>
            <OrganizerAddress organizer={organizer} language="en" />
            <p>
              In this policy, “we” means the organizer. The CoMatch app is operated on the organizer’s behalf
              by {legal.name ?? "the platform operator"} (see section 6).
            </p>
          </>
        ) : (
          <>
            <Operator legal={legal} language="en" />
            {legal.dpo && <p>Data protection officer: {legal.dpo}</p>}
          </>
        )}
      </Section>

      <Section title="2. What data we process">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Your answers</strong> to the event’s three questions, so we can find suitable people for
            you to talk to.
          </li>
          <li>
            <strong>Your selfie</strong>, so your match can recognize you in the room.
          </li>
          <li>
            <strong>Game history:</strong> who you were matched with in which round, whether you confirmed
            each other, failed code attempts, and the times you joined and were last connected.
          </li>
          <li>
            <strong>A random session ID</strong> stored in your browser (localStorage), so you can keep
            playing after reloading the page. The server only stores a hash of it.
          </li>
          <li>
            <strong>Server logs</strong> without IP addresses (time, requested address, errors), so we can
            keep the service running.
          </li>
        </ul>
      </Section>

      <Section title="3. Purpose and legal basis">
        <p>
          We process your answers and your selfie to match you with people to talk to during the event, to
          show your selfie to your matches and, for confirmed matches, on the big screen, and to create
          anonymous statistics for the organizers (for example, the number of matches).
        </p>
        <p>
          The legal basis is your consent (Art. 6(1)(a) GDPR), which you give before uploading your selfie.
          You can withdraw it at any time with “I’m leaving”. The session ID in your browser is technically
          necessary for the service (Section 25(2) no. 2 TDDDG, the German Telecommunications Digital Services
          Data Protection Act). Server logs are based on our legitimate interest in operating the service
          securely (Art. 6(1)(f) GDPR).
        </p>
      </Section>

      <Section title="4. Who sees your data">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your matches: your selfie and the answers you have in common.</li>
          <li>
            The big screen in the room: your selfie when you have confirmed a match, among the newcomers
            before the start, and in a collage at the end.
          </li>
          <li>
            The event’s organizers: your selfie, answers and status, for example to remove an inappropriate
            photo.
          </li>
        </ul>
      </Section>

      <Section title="5. How long we keep your data">
        <ul className="list-disc space-y-1 pl-5">
          <li>“I’m leaving”: your selfie, answers and game history are deleted immediately.</li>
          <li>
            After the event: your selfie and session are deleted automatically no later than {hours} hours
            after the event ends.
          </li>
          <li>
            Answers and game history are kept afterwards for statistics. Without the photo and the session,
            they can no longer be linked to a person.
          </li>
          <li>Database backups (without photos) are overwritten after 7 days at most.</li>
          <li>Server logs contain no IP addresses and are continuously overwritten.</li>
        </ul>
      </Section>

      <Section title="6. Hosting and recipients">
        {organizer && (
          <p>
            The CoMatch app is operated for us by {legal.name ?? "the platform operator"}
            {legal.address ? `, ${legal.address.replace(/\n/g, ", ")},` : ""} (data processing under Art. 28
            GDPR).
          </p>
        )}
        <p>
          Our servers and image storage are operated for us by Hetzner Online GmbH in Germany (data processing
          under Art. 28 GDPR). No data is transferred to third countries. We do not share your data with third
          parties and do not use any analytics or advertising services.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>
          You have the right to access, rectification, erasure, restriction of processing, data portability
          and to object, as well as the right to withdraw your consent at any time. Because we don’t store
          your name, we can only identify you through the session on your phone. The easiest way is therefore
          to contact us during the event or to use “I’m leaving”.
        </p>
        <p>
          You can also lodge a complaint with a data protection supervisory authority, for example in the
          German state where you live or where the event takes place.
        </p>
      </Section>

      {!organizer && (
        <Section title="8. Organizer accounts">
          <p>
            Anyone who runs their own events with CoMatch creates an account. For this we process the email
            address, the password (as a hash only), the account name, the organizer details entered, the time
            the terms of use were accepted, and sign-ins (session cookie, technically necessary under Section
            25(2) no. 2 TDDDG). The legal basis is the performance of the user agreement (Art. 6(1)(b) GDPR).
          </p>
          <p>
            We only send emails to this address that the account requires: confirmation of the address, team
            invitations and password reset links. Sending is handled by an email provider on our behalf.
          </p>
          <p>
            The data is stored for as long as the account exists. The account owner can delete it at any time
            under “Konto”; this removes all events, photos, members and invitations. Accounts whose email
            address was never confirmed are deleted automatically after 7 days.
          </p>
        </Section>
      )}
    </>
  );
}
