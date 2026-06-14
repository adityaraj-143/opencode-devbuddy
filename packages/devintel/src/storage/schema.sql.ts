import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const DevIntelProjectTable = sqliteTable("dev_intel_project", {
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
})
