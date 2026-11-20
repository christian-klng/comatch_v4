ALTER TABLE "account" ADD COLUMN "legal_from_operator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "terms_version" text;--> statement-breakpoint
-- Bestand: Konten, die es schon gibt, gehören dem Betreiber der Plattform. Für sie gelten
-- weiter dessen Angaben aus der Konfiguration, bis im Konto eigene eingetragen sind.
UPDATE "account" SET "legal_from_operator" = true;
