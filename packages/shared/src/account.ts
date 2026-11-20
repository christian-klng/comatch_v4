import { z } from "zod";

/** Rollen im Konto: Genau eine Person ist Inhaber*in, alle anderen sind Mitglieder. */
export const ADMIN_ROLES = ["owner", "member"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Leere Eingaben gelten als „nicht angegeben“. */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    schema.nullable(),
  );

export const accountInput = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(100),
  /** Wer die Events veranstaltet (Name bzw. Firma, Anschrift, Kontakt). */
  legalName: optionalText(z.string().trim().max(200)),
  legalAddress: optionalText(z.string().trim().max(500)),
  legalEmail: optionalText(z.email("Bitte eine gültige E-Mail eingeben.")),
});
export type AccountInput = z.infer<typeof accountInput>;

export interface AccountDetail extends AccountInput {
  id: string;
  /**
   * Der Betreiber der Plattform veranstaltet selbst: Ohne eigene Angaben gelten die aus dem
   * Impressum. Alle anderen Konten müssen die Angaben ausfüllen, bevor sie ein Event öffnen.
   */
  legalFromOperator: boolean;
}

/** Zum Löschen des Kontos muss dessen Name eingetippt werden. */
export const accountDeleteInput = z.object({ confirmName: z.string() });

/** Wer ein Event veranstaltet und für die Daten der Teilnehmenden verantwortlich ist. */
export interface Organizer {
  name: string;
  address: string;
  email: string;
}

/**
 * Fassung der Nutzungsbedingungen und des AV-Vertrags, der neue Konten zustimmen. Solange hier
 * der Entwurf steht, lässt sich die Registrierung im Produktivbetrieb nicht öffnen: erst die
 * Texte in apps/web/src/pages/legal/TermsPages.tsx einsetzen, dann hier ein Datum eintragen.
 */
export const TERMS_DRAFT = "entwurf";
export const TERMS_VERSION: string = TERMS_DRAFT;

export const ownerTransferInput = z.object({ adminId: z.uuid() });

/** Einmal-Links per Mail: E-Mail bestätigen, Passwort zurücksetzen. */
export const AUTH_TOKEN_KINDS = ["verify_email", "reset_password"] as const;
export type AuthTokenKind = (typeof AUTH_TOKEN_KINDS)[number];

export const MIN_PASSWORD_LENGTH = 10;

export const signupInput = z.object({
  email: z.string().trim().max(320).pipe(z.email("Bitte eine gültige E-Mail eingeben.")),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`).max(200),
  /** Name des neuen Kontos, z. B. die Organisation. */
  accountName: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(100),
  /** Zustimmung zu Nutzungsbedingungen und AV-Vertrag. */
  acceptTerms: z.literal(true, "Bitte stimme den Bedingungen zu."),
});
export type SignupInput = z.infer<typeof signupInput>;

/** Was die Oberfläche vor dem Login wissen muss. */
export interface PublicConfig {
  /** Dürfen sich neue Konten selbst registrieren? */
  signupOpen: boolean;
}

export const ACCOUNT_STATUSES = ["active", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Grenzen für neue Konten; je Konto überschreibbar (npm run accounts). */
export const DEFAULT_MAX_LIVE_EVENTS = 2;
export const DEFAULT_MAX_PARTICIPANTS = 150;
