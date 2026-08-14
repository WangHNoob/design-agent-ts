import pg from "pg";

/**
 * 对共享库补齐观测契约所需的结构（幂等）：
 * 本库 __drizzle_migrations 为旧版记账，drizzle-kit migrate 无法对齐；
 * 此处用 IF NOT EXISTS 补齐 0008/0009/0010 的增量，不重建既有表。
 */
const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL ?? "postgresql://game_designer:game_designer@localhost:5433/game_designer",
});
const c = await pool.connect();
try {
  const stmts = [
    `ALTER TABLE executions ADD COLUMN IF NOT EXISTS requirement_hash varchar(64)`,
    `ALTER TABLE executions ADD COLUMN IF NOT EXISTS outcome_signal jsonb`,
    `ALTER TABLE executions ADD COLUMN IF NOT EXISTS mode varchar(20)`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS version_snapshot_id uuid`,
    `ALTER TABLE hitl_checkpoints ADD COLUMN IF NOT EXISTS escalated_at timestamptz`,
    `CREATE INDEX IF NOT EXISTS idx_executions_requirement_hash ON executions (requirement_hash)`,
    `CREATE TABLE IF NOT EXISTS user_signal_events (
       id varchar(100) PRIMARY KEY NOT NULL,
       user_id varchar(36) NOT NULL,
       session_id varchar(100),
       execution_id varchar(100),
       trace_id varchar(100),
       kind varchar(20) NOT NULL,
       rating integer,
       created_at timestamptz DEFAULT now() NOT NULL,
       CONSTRAINT user_signal_kind_check CHECK (kind in ('copied', 'rated'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_user_signal_user_created ON user_signal_events (user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_user_signal_execution ON user_signal_events (execution_id)`,
  ];
  for (const stmt of stmts) {
    await c.query(stmt);
    console.log(`[ok] ${stmt}`);
  }
  const r = await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND ((table_name='executions' AND column_name IN ('mode','requirement_hash','outcome_signal'))
        OR (table_name='sessions' AND column_name='version_snapshot_id')
        OR (table_name='hitl_checkpoints' AND column_name='escalated_at'))
      ORDER BY table_name, column_name`,
  );
  console.log("verified:", r.rows.map((x) => `${x.table_name}.${x.column_name}`).join(", "));
} finally {
  c.release();
  await pool.end();
}
