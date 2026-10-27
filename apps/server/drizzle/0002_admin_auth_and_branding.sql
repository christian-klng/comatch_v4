ALTER TABLE "event" ADD COLUMN "presenter_token" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "logo_data" "bytea";--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "logo_mime" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "logo_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_presenterToken_unique" UNIQUE("presenter_token");