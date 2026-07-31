CREATE TABLE IF NOT EXISTS "cost_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(100),
	"trace_id" varchar(100),
	"execution_id" varchar(100),
	"agent_name" varchar(100),
	"workflow_id" varchar(255),
	"model_name" varchar(100),
	"input_tokens" integer NOT NULL DEFAULT 0,
	"output_tokens" integer NOT NULL DEFAULT 0,
	"estimated_cost_micros" bigint NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cost_usage_user_created" ON "cost_usage" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cost_usage_created" ON "cost_usage" ("created_at");
