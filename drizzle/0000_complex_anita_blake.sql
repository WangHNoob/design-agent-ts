CREATE EXTENSION IF NOT EXISTS "vector";
--> statement-breakpoint
CREATE TABLE "long_term_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"semantic_type" varchar(20) NOT NULL,
	"namespace" varchar(100) NOT NULL,
	"key" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"importance" real DEFAULT 0.5 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"tags" text[],
	"ttl_ms" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" varchar(36),
	"requirement" text NOT NULL,
	"mode" varchar(20) NOT NULL,
	"role" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"output" text,
	"error" text,
	"hitl_checkpoint_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"asset_type" varchar(50) NOT NULL,
	"asset_key" varchar(255) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner" varchar(10) DEFAULT 'user' NOT NULL,
	"is_mutable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_assets_asset_type_asset_key_user_id_unique" UNIQUE("asset_type","asset_key","user_id")
);
--> statement-breakpoint
CREATE INDEX "idx_ltm_user_ns" ON "long_term_memory" USING btree ("user_id","namespace");--> statement-breakpoint
CREATE INDEX "idx_ltm_type" ON "long_term_memory" USING btree ("semantic_type");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_user_assets_user_type" ON "user_assets" USING btree ("user_id","asset_type");--> statement-breakpoint
CREATE INDEX "idx_user_assets_system" ON "user_assets" USING btree ("owner","asset_type") WHERE "user_assets"."owner" = 'system';
