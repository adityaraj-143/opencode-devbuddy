export * as DevIntelSessions from "./store"

import { desc } from "drizzle-orm"
import { Effect } from "effect"
import { DevIntelDb } from "../storage/db"
import { DevIntelSessionTable } from "../storage/schema.sql"
import type { SessionRow } from "../storage/session-store"

function rowToSession(row: typeof DevIntelSessionTable.$inferSelect): SessionRow {
  return {
    id: row.id,
    opencodeSessionID: row.opencode_session_id ?? undefined,
    projectID: row.project_id ?? undefined,
    branchName: row.branch_name ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    messageCount: row.message_count,
    toolCallCount: row.tool_call_count,
    summary: row.summary ?? undefined,
    taskDescription: row.task_description ?? undefined,
    resolved: row.resolved === 1,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

export function listRecent(limit = 10) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const rows = yield* db.all(
      db.select().from(DevIntelSessionTable).orderBy(desc(DevIntelSessionTable.started_at)).limit(limit),
    )
    return rows.map(rowToSession)
  })
}
