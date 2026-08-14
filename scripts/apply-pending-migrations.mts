import pg from "pg";

/**
 * 共享库（localhost:5433/game_designer）结构补齐脚本（幂等）。
 *
 * 背景：`drizzle-kit migrate` 无法用于共享库——其 `__drizzle_migrations` 是旧版
 * 整数记账（id integer / hash text / created_at bigint），不跟踪 drizzle/*.sql 的
 * 真实应用状态；对空/旧记账 migrate 会从头重放 0000 的 CREATE TABLE →
 * "relation already exists"。因此共享库的增量一律在此用幂等写法补齐：
 *   - 加列  → ALTER TABLE ... ADD COLUMN IF NOT EXISTS
 *   - 新表  → CREATE TABLE IF NOT EXISTS
 *   - 索引  → CREATE INDEX IF NOT EXISTS
 *   - 约束  → 建表内联或单独 IF NOT EXISTS（PG 无 ADD CONSTRAINT IF NOT EXISTS，
 *             新表约束随 CREATE TABLE IF NOT EXISTS 一起声明即可）
 *
 * 新增迁移流程（后续迁移照此办理）：
 *   1. 正常 `pnpm db:generate` 产出 drizzle/NNNN_*.sql（供全新库/CI 用）；
 *   2. 把其中的「结构增量」（加列/新表/索引）按幂等写法追加到下方 stmts；
 *   3. `pnpm db:apply` 应用到共享库（可重复执行，不破坏既有数据）。
 *
 * Usage:
 *   pnpm db:apply           应用全部增量（幂等，可重复跑）
 *   pnpm db:apply -- --check  只校验状态不写库（有缺失时 exit 1，供巡检/CI）
 *   POSTGRES_URL=...        覆盖连接串（默认 postgresql://game_designer:***@localhost:5433/game_designer）
 */
const CHECK_ONLY = process.argv.includes("--check");
const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL ?? "postgresql://game_designer:game_designer@localhost:5433/game_designer",
});
const c = await pool.connect();

// ── 增量清单（按迁移号分组；后续迁移在此追加） ─────────────────────────────
// 0008_fat_supernaut.sql：observability 契约（executions 冗余列 / 会话快照 / HITL 升级）
const stmts: string[] = [
  `ALTER TABLE executions ADD COLUMN IF NOT EXISTS requirement_hash varchar(64)`,
  `ALTER TABLE executions ADD COLUMN IF NOT EXISTS outcome_signal jsonb`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS version_snapshot_id uuid`,
  `ALTER TABLE hitl_checkpoints ADD COLUMN IF NOT EXISTS escalated_at timestamptz`,
  `CREATE INDEX IF NOT EXISTS idx_executions_requirement_hash ON executions (requirement_hash)`,
  // 0009_tranquil_misty_knight.sql：executions.mode（query/design/table）
  `ALTER TABLE executions ADD COLUMN IF NOT EXISTS mode varchar(20)`,
  // 0010_right_famine.sql：用户侧信号（复制/评分），观测台第 4 数据源
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

try {
  if (!CHECK_ONLY) {
    for (const stmt of stmts) {
      await c.query(stmt);
      console.log(`[ok] ${stmt}`);
    }
  }

  // ── 状态校验（两种模式都执行） ──────────────────────────────────────────
  const problems: string[] = [];
  const col = await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND ((table_name='executions' AND column_name IN ('mode','requirement_hash','outcome_signal'))
        OR (table_name='sessions' AND column_name='version_snapshot_id')
        OR (table_name='hitl_checkpoints' AND column_name='escalated_at'))
      ORDER BY table_name, column_name`,
  );
  const haveCols = new Set(col.rows.map((x) => `${x.table_name}.${x.column_name}`));
  for (const need of ["executions.mode", "executions.requirement_hash", "executions.outcome_signal", "sessions.version_snapshot_id", "hitl_checkpoints.escalated_at"]) {
    if (!haveCols.has(need)) problems.push(`missing column ${need}`);
  }
  const tbl = await c.query(
    `SELECT to_regclass('public.user_signal_events') AS t, to_regclass('public.idx_executions_requirement_hash') AS i1,
            to_regclass('public.idx_user_signal_user_created') AS i2, to_regclass('public.idx_user_signal_execution') AS i3`,
  );
  const t = tbl.rows[0] ?? {};
  if (!t.t) problems.push("missing table user_signal_events");
  if (!t.i1) problems.push("missing index idx_executions_requirement_hash");
  if (!t.i2) problems.push("missing index idx_user_signal_user_created");
  if (!t.i3) problems.push("missing index idx_user_signal_execution");
  const chk = await c.query(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'public.user_signal_events'::regclass AND conname = 'user_signal_kind_check'`,
  );
  if (chk.rowCount === 0) problems.push("missing constraint user_signal_kind_check");

  console.log(
    `[${CHECK_ONLY ? "check" : "apply"}] columns=${[...haveCols].sort().join(", ") || "(none)"}`
    + ` table=${t.t ? "ok" : "MISSING"} indexes=${t.i1 && t.i2 && t.i3 ? "ok" : "MISSING"} constraint=${chk.rowCount ? "ok" : "MISSING"}`,
  );
  if (problems.length > 0) {
    for (const p of problems) console.error(`[${CHECK_ONLY ? "check" : "apply"}] !! ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`[${CHECK_ONLY ? "check" : "apply"}] 共享库结构完整`);
  }
} finally {
  c.release();
  await pool.end();
}
