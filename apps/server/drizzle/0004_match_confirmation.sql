ALTER TABLE "match_member" ADD COLUMN "decoy_codes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "match_member" ADD COLUMN "last_wrong_at" timestamp with time zone;