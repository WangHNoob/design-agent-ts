CREATE TABLE "user_signal_events" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(100),
	"execution_id" varchar(100),
	"trace_id" varchar(100),
	"kind" varchar(20) NOT NULL,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_signal_kind_check" CHECK ("user_signal_events"."kind" in ('copied', 'rated'))
);
--> statement-breakpoint
CREATE INDEX "idx_user_signal_user_created" ON "user_signal_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_signal_execution" ON "user_signal_events" USING btree ("execution_id");