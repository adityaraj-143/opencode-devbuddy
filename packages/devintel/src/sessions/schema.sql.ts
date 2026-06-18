import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const DevIntelSessionTable = sqliteTable("dev_intel_session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  started_at: integer().notNull(),
  ended_at: integer(),
  active_branch: text(),
  current_task_id: text(),
  files_touched: text().notNull().default("[]"),
  tools_used: text().notNull().default("[]"),
  messages_sent: integer().notNull().default(0),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
})
