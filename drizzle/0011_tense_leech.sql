ALTER TABLE "sessions" ADD COLUMN "context_summary" text;
ALTER TABLE "sessions" ADD COLUMN "context_tokens" integer;
ALTER TABLE "sessions" ADD COLUMN "context_window" integer;
