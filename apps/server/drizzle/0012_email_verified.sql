ALTER TABLE "admin_user" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
-- Bestand: Alle bisherigen Konten kamen per Einladung oder Kommandozeile und gelten als bestätigt.
UPDATE "admin_user" SET "email_verified_at" = "created_at";
