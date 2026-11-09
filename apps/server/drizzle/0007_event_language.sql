CREATE TYPE "public"."event_language" AS ENUM('de', 'en');--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "language" "event_language" DEFAULT 'de' NOT NULL;