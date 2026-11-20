CREATE TYPE "public"."admin_role" AS ENUM('owner', 'member');--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "legal_address" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "legal_email" text;--> statement-breakpoint
ALTER TABLE "admin_user" ADD COLUMN "role" "admin_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_user_one_owner" ON "admin_user" USING btree ("account_id") WHERE "admin_user"."role" = 'owner';--> statement-breakpoint
-- Bestand: Die älteste Person jedes Kontos wird Inhaber*in.
UPDATE "admin_user" SET "role" = 'owner'
WHERE "id" IN (
  SELECT DISTINCT ON ("account_id") "id" FROM "admin_user" ORDER BY "account_id", "created_at", "id"
);
