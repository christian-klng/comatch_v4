import nodemailer from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  /** Reiner Text; Links stehen jeweils allein in einer Zeile. */
  text: string;
}

/** Versand von E-Mails (Einladungen, Passwort zurücksetzen). */
export interface Mailer {
  /** false: Es ist kein Versand eingerichtet, Mails landen nur im Server-Log. */
  readonly enabled: boolean;
  send(mail: Mail): Promise<void>;
}

/** Versand über SMTP, z. B. `smtps://nutzer:passwort@smtp.example.de:465`. */
export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    enabled: true,
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/**
 * Ohne SMTP wird nichts verschickt. `withText` schreibt die ganze Mail ins Log (lokale
 * Entwicklung); im Betrieb bleibt es bei einem Hinweis, weil die Mails geheime Links enthalten.
 */
export function createLogMailer(log: (message: string) => void, withText: boolean): Mailer {
  return {
    enabled: false,
    async send(mail) {
      const note = `Kein Mailversand eingerichtet (SMTP_URL). Nicht verschickt: „${mail.subject}“`;
      log(withText ? `${note} an ${mail.to}\n${mail.text}` : note);
    },
  };
}

/** Für Tests: merkt sich alle Mails. */
export function createMemoryMailer() {
  const sent: Mail[] = [];
  const mailer: Mailer & { sent: Mail[]; failNext: boolean } = {
    enabled: true,
    sent,
    /** Der nächste Versand scheitert (z. B. Mailserver nicht erreichbar). */
    failNext: false,
    async send(mail) {
      if (mailer.failNext) {
        mailer.failNext = false;
        throw new Error("Mailserver nicht erreichbar");
      }
      sent.push(mail);
    },
  };
  return mailer;
}
