CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "status" "account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "max_live_events" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "max_participants" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
-- Bestand: Konten, die es schon gibt, behalten den bisherigen Spielraum (bis 250 Personen je
-- Event, keine Grenze für gleichzeitige Events in der Praxis). Die Standardwerte gelten für neue.
UPDATE "account" SET "max_live_events" = 10, "max_participants" = 250;
