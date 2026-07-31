CREATE TABLE IF NOT EXISTS "agent_trace_sessions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_trace_sessions_user_session_unique" UNIQUE("user_id","session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_traces" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"trace_session_id" varchar(100) NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"execution_id" varchar(100),
	"name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'unset' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_traces_status_check" CHECK ("agent_traces"."status" in ('ok', 'error', 'unset')),
	CONSTRAINT "agent_traces_trace_session_fk" FOREIGN KEY ("trace_session_id") REFERENCES "agent_trace_sessions"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_spans" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"trace_id" varchar(100) NOT NULL,
	"parent_span_id" varchar(100),
	"name" varchar(255) NOT NULL,
	"phase" varchar(40),
	"kind" varchar(20) DEFAULT 'internal' NOT NULL,
	"status" varchar(20) DEFAULT 'unset' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_spans_kind_check" CHECK ("agent_spans"."kind" in ('internal', 'client', 'server')),
	CONSTRAINT "agent_spans_status_check" CHECK ("agent_spans"."status" in ('ok', 'error', 'unset')),
	CONSTRAINT "agent_spans_phase_check" CHECK (
		"agent_spans"."phase" is null or "agent_spans"."phase" in (
			'pre_reasoning', 'post_reasoning',
			'pre_tool_execution', 'post_tool_execution',
			'pre_summary', 'post_summary',
			'pre_agent_call', 'post_agent_call',
			'on_error'
		)
	),
	CONSTRAINT "agent_spans_trace_fk" FOREIGN KEY ("trace_id") REFERENCES "agent_traces"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_trace_sessions_user_session" ON "agent_trace_sessions" ("user_id","session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_traces_user_session" ON "agent_traces" ("user_id","session_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_traces_user_execution" ON "agent_traces" ("user_id","execution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_spans_user_trace" ON "agent_spans" ("user_id","trace_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_spans_parent" ON "agent_spans" ("user_id","parent_span_id");
