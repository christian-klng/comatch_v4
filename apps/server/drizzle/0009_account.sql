CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_invite" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_user" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "account_id" uuid;--> statement-breakpoint
-- Bestand übernehmen: Alles, was es bisher gibt, gehört einem gemeinsamen Konto.
-- Eine leere Datenbank bekommt keins.
INSERT INTO "account" ("name")
SELECT 'Hauptkonto'
WHERE EXISTS (SELECT 1 FROM "admin_user")
   OR EXISTS (SELECT 1 FROM "admin_invite")
   OR EXISTS (SELECT 1 FROM "event");--> statement-breakpoint
UPDATE "admin_user" SET "account_id" = (SELECT "id" FROM "account");--> statement-breakpoint
UPDATE "admin_invite" SET "account_id" = (SELECT "id" FROM "account");--> statement-breakpoint
UPDATE "event" SET "account_id" = (SELECT "id" FROM "account");--> statement-breakpoint
ALTER TABLE "admin_invite" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_user" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_invite" ADD CONSTRAINT "admin_invite_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_invite_account_id_index" ON "admin_invite" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "admin_user_account_id_index" ON "admin_user" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "event_account_id_index" ON "event" USING btree ("account_id");