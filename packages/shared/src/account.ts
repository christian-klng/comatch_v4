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
}

export const ownerTransferInput = z.object({ adminId: z.uuid() });

/** Einmal-Links per Mail: E-Mail bestätigen, Passwort zurücksetzen. */
export const AUTH_TOKEN_KINDS = ["verify_email", "reset_password"] as const;
export type AuthTokenKind = (typeof AUTH_TOKEN_KINDS)[number];
