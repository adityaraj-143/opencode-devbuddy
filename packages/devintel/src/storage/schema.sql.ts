import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"

export const DevIntelProjectTable = sqliteTable(
  "dev_intel_project",
  {
    id: text().primaryKey(),
    opencode_project_id: text(),
    worktree_path: text().notNull(),
    name: text().notNull(),
    vcs_type: text().default("git").notNull(),
    vcs_remote: text(),
    last_opened_at: integer(),
    times_opened: integer().default(0).notNull(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
)

export const DevIntelMemoryEntryTable = sqliteTable(
  "dev_intel_memory_entry",
  {
    id: text().primaryKey(),
    project_id: text().references(() => DevIntelProjectTable.id),
    session_id: text(),
    memory_type: text().notNull(),
    content: text({ mode: "json" }).notNull(),
    source: text().default("inferred").notNull(),
    importance: real().default(0.5).notNull(),
    access_count: integer().default(0).notNull(),
    last_accessed_at: integer(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    index("idx_mem_project").on(table.project_id),
    index("idx_mem_session").on(table.session_id),
    index("idx_mem_type").on(table.memory_type),
  ],
)

export const DevIntelSessionTable = sqliteTable(
  "dev_intel_session",
  {
    id: text().primaryKey(),
    opencode_session_id: text(),
    project_id: text().references(() => DevIntelProjectTable.id),
    branch_name: text(),
    started_at: integer().notNull(),
    ended_at: integer(),
    message_count: integer().default(0).notNull(),
    tool_call_count: integer().default(0).notNull(),
    summary: text(),
    task_description: text(),
    resolved: integer().default(0).notNull(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
)

export const DevIntelActivityTable = sqliteTable(
  "dev_intel_activity",
  {
    id: text().primaryKey(),
    project_id: text().references(() => DevIntelProjectTable.id),
    session_id: text().references(() => DevIntelSessionTable.id),
    activity_type: text().notNull(),
    category: text().notNull(),
    detail_json: text({ mode: "json" }).notNull(),
    occurred_at: integer().notNull(),
  },
  (table) => [
    index("idx_activity_project").on(table.project_id),
    index("idx_activity_session").on(table.session_id),
    index("idx_activity_time").on(table.occurred_at),
    index("idx_activity_type").on(table.activity_type),
  ],
)

export const DevIntelDeveloperProfileTable = sqliteTable("dev_intel_developer_profile", {
  key: text().primaryKey(),
  value_json: text({ mode: "json" }).notNull(),
  time_updated: integer().notNull(),
})
