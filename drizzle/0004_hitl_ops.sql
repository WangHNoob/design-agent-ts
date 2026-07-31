ALTER TABLE "hitl_checkpoints" DROP CONSTRAINT IF EXISTS "hitl_checkpoints_status_check";
--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" ADD CONSTRAINT "hitl_checkpoints_status_check" CHECK (
	"hitl_checkpoints"."status" in (
		'waiting_review', 'approved', 'rejected', 'modified', 'expired', 'escalated'
	)
);
--> statement-breakpoint
ALTER TABLE "hitl_checkpoints" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hitl_checkpoints_pending_created" ON "hitl_checkpoints" ("status","created_at") WHERE "status" in ('waiting_review','escalated');
