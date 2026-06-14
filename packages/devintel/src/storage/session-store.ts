export * as DevIntelSessionStore from "./session-store"

import { Effect } from "effect"
import { DevIntelSessionTable } from "./schema.sql"
import { DevIntelDb } from "./db"
import { eq } from "drizzle-orm"

export interface SessionRow {
  id: string
  opencodeSessionID?: string
  projectID?: string
  branchName?: string
  startedAt: number
  endedAt?: number
  messageCount: number
  toolCallCount: number
  summary?: string
  taskDescription?: string
  resolved: boolean
  timeCreated: number
  timeUpdated: number
}

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

export function create(input: {
  id: string
  opencodeSessionID?: string
  projectID?: string
  branchName?: string
}) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const now = Date.now()
    yield* db.run(
      db.insert(DevIntelSessionTable).values({
        id: input.id,
        opencode_session_id: input.opencodeSessionID,
        project_id: input.projectID,
        branch_name: input.branchName,
        started_at: now,
        time_created: now,
        time_updated: now,
      }),
    )
  })
}

export function findByOpenCodeID(opencodeSessionID: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const row = yield* db.get(
      db.select().from(DevIntelSessionTable).where(eq(DevIntelSessionTable.opencode_session_id, opencodeSessionID)),
    )
    return row ? rowToSession(row) : undefined
  })
}

export function updateEnd(id: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    yield* db.run(
      db.update(DevIntelSessionTable).set({ ended_at: Date.now(), time_updated: Date.now() }).where(eq(DevIntelSessionTable.id, id)),
    )
  })
}

export function incrementToolCalls(id: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const existing = yield* db.get(db.select().from(DevIntelSessionTable).where(eq(DevIntelSessionTable.id, id)))
    if (!existing) return
    yield* db.run(
      db
        .update(DevIntelSessionTable)
        .set({ tool_call_count: existing.tool_call_count + 1, time_updated: Date.now() })
        .where(eq(DevIntelSessionTable.id, id)),
    )
  })
}

export function incrementMessageCount(id: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const existing = yield* db.get(db.select().from(DevIntelSessionTable).where(eq(DevIntelSessionTable.id, id)))
    if (!existing) return
    yield* db.run(
      db
        .update(DevIntelSessionTable)
        .set({ message_count: existing.message_count + 1, time_updated: Date.now() })
        .where(eq(DevIntelSessionTable.id, id)),
    )
  })
}
