CREATE TABLE "agent_spans" (
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
	CONSTRAINT "agent_spans_phase_check" CHECK ("agent_spans"."phase" is null or "agent_spans"."phase" in (
        'pre_reasoning', 'post_reasoning',
        'pre_tool_execution', 'post_tool_execution',
        'pre_summary', 'post_summary',
        'pre_agent_call', 'post_agent_call',
        'on_error'
      ))
);
--> statement-breakpoint
CREATE TABLE "agent_trace_sessions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_trace_sessions_user_session_unique" UNIQUE("user_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "agent_traces" (
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
	CONSTRAINT "agent_traces_status_check" CHECK ("agent_traces"."status" in ('ok', 'error', 'unset'))
);
--> statement-breakpoint
CREATE TABLE "artifact_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"canary_percent" integer DEFAULT 0 NOT NULL,
	"whitelist_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "artifact_versions_kind_name_version_unique" UNIQUE("kind","name","version"),
	CONSTRAINT "artifact_versions_kind_check" CHECK ("artifact_versions"."kind" in ('prompt', 'skill', 'workflow')),
	CONSTRAINT "artifact_versions_canary_check" CHECK ("artifact_versions"."canary_percent" >= 0 and "artifact_versions"."canary_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
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
	CONSTRAINT "audit_logs_outcome_check" CHECK ("audit_logs"."outcome" in ('success', 'denied', 'error'))
);
--> statement-breakpoint
CREATE TABLE "cost_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(100),
	"trace_id" varchar(100),
	"execution_id" varchar(100),
	"agent_name" varchar(100),
	"workflow_id" varchar(255),
	"model_name" varchar(100),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_version_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" DROP CONSTRAINT "hitl_checkpoints_status_check";--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "requirement_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "outcome_signal" jsonb;--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "version_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_spans" ADD CONSTRAINT "agent_spans_trace_id_agent_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."agent_traces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_traces" ADD CONSTRAINT "agent_traces_trace_session_id_agent_trace_sessions_id_fk" FOREIGN KEY ("trace_session_id") REFERENCES "public"."agent_trace_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_spans_user_trace" ON "agent_spans" USING btree ("user_id","trace_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_agent_spans_parent" ON "agent_spans" USING btree ("user_id","parent_span_id");--> statement-breakpoint
CREATE INDEX "idx_agent_trace_sessions_user_session" ON "agent_trace_sessions" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "idx_agent_traces_user_session" ON "agent_traces" USING btree ("user_id","session_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_agent_traces_user_execution" ON "agent_traces" USING btree ("user_id","execution_id");--> statement-breakpoint
CREATE INDEX "idx_artifact_versions_kind_name" ON "artifact_versions" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "idx_artifact_versions_active" ON "artifact_versions" USING btree ("kind","name","is_active");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_created" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_action" ON "audit_logs" USING btree ("user_id","action","created_at");--> statement-breakpoint
CREATE INDEX "idx_cost_usage_user_created" ON "cost_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_cost_usage_created" ON "cost_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_session_version_snapshots_user" ON "session_version_snapshots" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_executions_requirement_hash" ON "executions" USING btree ("requirement_hash");--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" ADD CONSTRAINT "hitl_checkpoints_status_check" CHECK ("hitl_checkpoints"."status" in ('waiting_review', 'approved', 'rejected', 'modified', 'expired', 'escalated'));