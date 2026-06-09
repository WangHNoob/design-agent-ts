import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

const userId = varchar("user_id", { length: 36 }).notNull();
const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const userAssets = pgTable(
  "user_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    assetType: varchar("asset_type", { length: 50 }).notNull(),
    assetKey: varchar("asset_key", { length: 255 }).notNull(),
    data: jsonb("data").notNull().default({}),
    owner: varchar("owner", { length: 10 }).notNull().default("user"),
    isMutable: boolean("is_mutable").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique().on(table.assetType, table.assetKey, table.userId),
    index("idx_user_assets_user_type").on(table.userId, table.assetType),
    index("idx_user_assets_system").on(table.owner, table.assetType).where(sql`${table.owner} = 'system'`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }),
    requirement: text("requirement").notNull(),
    mode: varchar("mode", { length: 20 }).notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    output: text("output"),
    error: text("error"),
    hitlCheckpointId: varchar("hitl_checkpoint_id", { length: 100 }),
    createdAt,
    updatedAt,
  },
  (table) => [index("idx_sessions_user").on(table.userId, table.status)],
);

export const longTermMemory = pgTable(
  "long_term_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    semanticType: varchar("semantic_type", { length: 20 }).notNull(),
    namespace: varchar("namespace", { length: 100 }).notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    importance: real("importance").notNull().default(0.5),
    accessCount: integer("access_count").notNull().default(0),
    tags: text("tags").array(),
    ttlMs: bigint("ttl_ms", { mode: "number" }),
    createdAt,
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ltm_user_ns").on(table.userId, table.namespace),
    index("idx_ltm_type").on(table.semanticType),
  ],
);
