CREATE TABLE "execution_attempts" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"execution_id" varchar(100) NOT NULL,
	"task_id" varchar(100) NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"error_class" varchar(20),
	"error_code" varchar(100),
	"error_message" text,
	"input_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_payload" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_attempts_user_task_number_unique" UNIQUE("user_id","task_id","attempt_number"),
	CONSTRAINT "execution_attempts_status_check" CHECK ("execution_attempts"."status" in ('running', 'success', 'error', 'cancelled', 'timed_out')),
	CONSTRAINT "execution_attempts_error_class_check" CHECK ("execution_attempts"."error_class" is null or "execution_attempts"."error_class" in ('transient', 'permanent', 'cancelled', 'timeout'))
);
--> statement-breakpoint
CREATE TABLE "execution_tasks" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"execution_id" varchar(100) NOT NULL,
	"task_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"agent_name" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_payload" jsonb,
	"resume_cursor" varchar(255),
	"resume_payload" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"error_class" varchar(20),
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_tasks_user_execution_key_unique" UNIQUE("user_id","execution_id","task_key"),
	CONSTRAINT "execution_tasks_status_check" CHECK ("execution_tasks"."status" in ('pending', 'running', 'success', 'error', 'skipped', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan_payload" jsonb,
	"result_payload" jsonb,
	"resume_cursor" varchar(255),
	"resume_payload" jsonb,
	"error_class" varchar(20),
	"error_message" text,
	"deadline_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executions_user_idempotency_unique" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "executions_status_check" CHECK ("executions"."status" in ('queued', 'running', 'waiting_hitl', 'completed', 'failed', 'cancelled', 'timed_out'))
);
--> statement-breakpoint
CREATE TABLE "hitl_checkpoints" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"execution_id" varchar(100),
	"task_id" varchar(100),
	"idempotency_key" varchar(255),
	"stage" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'waiting_review' NOT NULL,
	"content" text NOT NULL,
	"content_type" varchar(20) DEFAULT 'markdown' NOT NULL,
	"agent_name" varchar(100),
	"review_point" varchar(100) NOT NULL,
	"resume_cursor" varchar(255),
	"resume_payload" jsonb,
	"reviewer_id" varchar(36),
	"fallback" boolean DEFAULT false NOT NULL,
	"review_action" varchar(20),
	"review_comment" text,
	"modified_content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hitl_checkpoints_user_idempotency_unique" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "hitl_checkpoints_stage_check" CHECK ("hitl_checkpoints"."stage" in ('plan', 'subagent', 'integrate')),
	CONSTRAINT "hitl_checkpoints_status_check" CHECK ("hitl_checkpoints"."status" in ('waiting_review', 'approved', 'rejected', 'modified')),
	CONSTRAINT "hitl_checkpoints_content_type_check" CHECK ("hitl_checkpoints"."content_type" in ('markdown', 'json')),
	CONSTRAINT "hitl_checkpoints_review_action_check" CHECK ("hitl_checkpoints"."review_action" is null or "hitl_checkpoints"."review_action" in ('approve', 'reject', 'modify'))
);
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_task_id_execution_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."execution_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" ADD CONSTRAINT "hitl_checkpoints_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" ADD CONSTRAINT "hitl_checkpoints_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" ADD CONSTRAINT "hitl_checkpoints_task_id_execution_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."execution_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_execution_attempts_user_execution_task" ON "execution_attempts" USING btree ("user_id","execution_id","task_id");--> statement-breakpoint
CREATE INDEX "idx_execution_attempts_user_status" ON "execution_attempts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_execution_tasks_user_execution_status" ON "execution_tasks" USING btree ("user_id","execution_id","status");--> statement-breakpoint
CREATE INDEX "idx_executions_user_status_created" ON "executions" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_executions_user_session" ON "executions" USING btree ("user_id","session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hitl_checkpoints_user_status_created" ON "hitl_checkpoints" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_hitl_checkpoints_user_session" ON "hitl_checkpoints" USING btree ("user_id","session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hitl_checkpoints_user_execution_review" ON "hitl_checkpoints" USING btree ("user_id","execution_id","review_point");