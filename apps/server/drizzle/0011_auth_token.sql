CREATE TYPE "public"."auth_token_kind" AS ENUM('verify_email', 'reset_password');--> statement-breakpoint
CREATE TABLE "auth_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"kind" "auth_token_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_admin_id_admin_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_token_admin_id_index" ON "auth_token" USING btree ("admin_id");