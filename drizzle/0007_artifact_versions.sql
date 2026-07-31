-- Artifact version registry (prompts, skills, workflows)
CREATE TABLE IF NOT EXISTS "artifact_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" varchar(20) NOT NULL,
  "name" varchar(255) NOT NULL,
  "version" varchar(50) NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT false,
  "canary_percent" integer NOT NULL DEFAULT 0,
  "whitelist_user_ids" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "retired_at" timestamptz,
  CONSTRAINT "artifact_versions_kind_check" CHECK ("kind" IN ('prompt', 'skill', 'workflow')),
  CONSTRAINT "artifact_versions_canary_check" CHECK ("canary_percent" >= 0 AND "canary_percent" <= 100),
  CONSTRAINT "artifact_versions_kind_name_version_unique" UNIQUE ("kind", "name", "version")
);

CREATE INDEX IF NOT EXISTS "idx_artifact_versions_kind_name"
  ON "artifact_versions" ("kind", "name");

CREATE INDEX IF NOT EXISTS "idx_artifact_versions_active"
  ON "artifact_versions" ("kind", "name", "is_active")
  WHERE "retired_at" IS NULL;

-- Session-bound MVCC snapshots
CREATE TABLE IF NOT EXISTS "session_version_snapshots" (
  "id" uuid PRIMARY KEY,
  "user_id" varchar(36) NOT NULL,
  "bindings" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_session_version_snapshots_user"
  ON "session_version_snapshots" ("user_id", "created_at");

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "version_snapshot_id" uuid
  REFERENCES "session_version_snapshots" ("id");
