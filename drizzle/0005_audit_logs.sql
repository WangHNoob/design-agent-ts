CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"action" varchar(50) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" varchar(255),
	"session_id" varchar(100),
	"execution_id" varchar(100),
	"trace_id" varchar(100),
	"outcome" varchar(20) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_outcome_check" CHECK ("outcome" in ('success', 'denied', 'error'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_created" ON "audit_logs" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_action" ON "audit_logs" ("user_id","action","created_at");
