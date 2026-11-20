import type { Mail } from "./mailer.ts";

const footer = "\n\nDiese Mail wurde automatisch von CoMatch verschickt.";

export function inviteMail(to: string, values: { accountName: string; inviter: string; url: string }): Mail {
  return {
    to,
    subject: `Einladung zu CoMatch: ${values.accountName}`,
    text:
      `Hallo,\n\n${values.inviter} lädt dich ein, bei CoMatch im Konto „${values.accountName}“ mitzuarbeiten.\n\n` +
      `Über diesen Link legst du dein Passwort fest (7 Tage gültig):\n${values.url}\n\n` +
      "Wenn du mit der Einladung nichts anfangen kannst, ignoriere diese Mail einfach." +
      footer,
  };
}

export function passwordResetMail(to: string, values: { url: string }): Mail {
  return {
    to,
    subject: "CoMatch: Passwort zurücksetzen",
    text:
      "Hallo,\n\nfür dein CoMatch-Konto wurde ein neues Passwort angefordert.\n\n" +
      `Über diesen Link legst du es fest (1 Stunde gültig):\n${values.url}\n\n` +
      "Wenn du das nicht warst, ignoriere diese Mail. Dein Passwort bleibt dann unverändert." +
      footer,
  };
}

export function verifyEmailMail(to: string, values: { url: string }): Mail {
  return {
    to,
    subject: "CoMatch: Bitte bestätige deine E-Mail",
    text:
      "Hallo,\n\nwillkommen bei CoMatch! Bestätige kurz deine E-Mail, dann kannst du dein erstes Event anlegen.\n\n" +
      `Link zum Bestätigen (24 Stunden gültig):\n${values.url}\n\n` +
      "Wenn du kein Konto angelegt hast, ignoriere diese Mail. Das Konto wird dann nach einer Woche gelöscht." +
      footer,
  };
}
