CREATE TYPE "public"."event_status" AS ENUM('draft', 'open', 'running', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."match_group_kind" AS ENUM('round', 'pool');--> statement-breakpoint
CREATE TYPE "public"."match_group_status" AS ENUM('open', 'confirmed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."match_mode" AS ENUM('same', 'complementary');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('onboarding', 'pool', 'matched', 'confirmed', 'inactive', 'removed');--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "answer_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"round_duration_s" integer DEFAULT 300 NOT NULL,
	"first_match_delay_s" integer DEFAULT 30 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"round_ends_at" timestamp with time zone,
	"presenter_token_hash" text,
	"logo_key" text,
	"primary_color" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "event_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "match_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"kind" "match_group_kind" NOT NULL,
	"status" "match_group_status" DEFAULT 'open' NOT NULL,
	"similarity" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_member" (
	"match_group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"own_code" text NOT NULL,
	"confirms_participant_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"wrong_attempts" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "match_member_match_group_id_participant_id_pk" PRIMARY KEY("match_group_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "option_complement" (
	"option_id" uuid NOT NULL,
	"complement_option_id" uuid NOT NULL,
	CONSTRAINT "option_complement_option_id_complement_option_id_pk" PRIMARY KEY("option_id","complement_option_id"),
	CONSTRAINT "option_complement_not_self" CHECK ("option_complement"."option_id" <> "option_complement"."complement_option_id")
);
--> statement-breakpoint
CREATE TABLE "pair_history" (
	"event_id" uuid NOT NULL,
	"participant_a" uuid NOT NULL,
	"participant_b" uuid NOT NULL,
	"times_met" integer DEFAULT 1 NOT NULL,
	"last_round" integer NOT NULL,
	CONSTRAINT "pair_history_event_id_participant_a_participant_b_pk" PRIMARY KEY("event_id","participant_a","participant_b"),
	CONSTRAINT "pair_history_ordered" CHECK ("pair_history"."participant_a" < "pair_history"."participant_b")
);
--> statement-breakpoint
CREATE TABLE "participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"selfie_key" text,
	"consent_at" timestamp with time zone,
	"status" "participant_status" DEFAULT 'onboarding' NOT NULL,
	"pool_since" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_sessionTokenHash_unique" UNIQUE("session_token_hash")
);
--> statement-breakpoint
CREATE TABLE "participant_answer" (
	"participant_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer_option_id" uuid NOT NULL,
	CONSTRAINT "participant_answer_participant_id_question_id_pk" PRIMARY KEY("participant_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"text" text NOT NULL,
	"match_mode" "match_mode" DEFAULT 'same' NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	CONSTRAINT "question_position_range" CHECK ("question"."position" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_invited_by_admin_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_option" ADD CONSTRAINT "answer_option_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_created_by_admin_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_group" ADD CONSTRAINT "match_group_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_group" ADD CONSTRAINT "match_group_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_member" ADD CONSTRAINT "match_member_match_group_id_match_group_id_fk" FOREIGN KEY ("match_group_id") REFERENCES "public"."match_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_member" ADD CONSTRAINT "match_member_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_member" ADD CONSTRAINT "match_member_confirms_participant_id_participant_id_fk" FOREIGN KEY ("confirms_participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_complement" ADD CONSTRAINT "option_complement_option_id_answer_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."answer_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_complement" ADD CONSTRAINT "option_complement_complement_option_id_answer_option_id_fk" FOREIGN KEY ("complement_option_id") REFERENCES "public"."answer_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_history" ADD CONSTRAINT "pair_history_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_history" ADD CONSTRAINT "pair_history_participant_a_participant_id_fk" FOREIGN KEY ("participant_a") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_history" ADD CONSTRAINT "pair_history_participant_b_participant_id_fk" FOREIGN KEY ("participant_b") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_answer" ADD CONSTRAINT "participant_answer_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_answer" ADD CONSTRAINT "participant_answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_answer" ADD CONSTRAINT "participant_answer_answer_option_id_answer_option_id_fk" FOREIGN KEY ("answer_option_id") REFERENCES "public"."answer_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_option_question_id_position_index" ON "answer_option" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "match_group_event_id_round_id_index" ON "match_group" USING btree ("event_id","round_id");--> statement-breakpoint
CREATE INDEX "match_group_event_id_status_index" ON "match_group" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "match_member_participant_id_index" ON "match_member" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "participant_event_id_status_index" ON "participant" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "question_event_id_position_index" ON "question" USING btree ("event_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "round_event_id_number_index" ON "round" USING btree ("event_id","number");