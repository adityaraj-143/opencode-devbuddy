export * as DevIntelSessionStore from "./store"

import { Effect } from "effect"
import { eq, desc, and, isNull, sql } from "drizzle-orm"
import { DevIntelSessionTable } from "./schema.sql"
import { DevIntelDb } from "../storage/db"
import type { DevIntelSession } from "./types"

type SessionRowRaw = typeof DevIntelSessionTable.$inferSelect

export interface SessionRow {
  id: string
  projectId: string
  startedAt: number
  endedAt?: number
  duration?: number
  activeBranch?: string
  currentTaskId?: string
  filesTouched: string[]
  toolsUsed: string[]
  messagesSent: number
  timeCreated: number
  timeUpdated: number
}

function rowToSession(row: SessionRowRaw): SessionRow {
  return {
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    duration: row.ended_at ? row.ended_at - row.started_at : undefined,
    activeBranch: row.active_branch ?? undefined,
    currentTaskId: row.current_task_id ?? undefined,
    filesTouched: JSON.parse(row.files_touched) as string[],
    toolsUsed: JSON.parse(row.tools_used) as string[],
    messagesSent: row.messages_sent,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

function parseJSONArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function insert(input: { id: string; projectId: string; activeBranch?: string }) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const now = Date.now()
    yield* db.run(
      db.insert(DevIntelSessionTable).values({
        id: input.id,
        project_id: input.projectId,
        started_at: now,
        active_branch: input.activeBranch,
        files_touched: "[]",
        tools_used: "[]",
        messages_sent: 0,
        time_created: now,
        time_updated: now,
      }),
    )
    return input.id
  })
}

export function findActiveByProject(projectId: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const row = yield* db.get<SessionRowRaw>(
      db
        .select()
        .from(DevIntelSessionTable)
        .where(and(eq(DevIntelSessionTable.project_id, projectId), isNull(DevIntelSessionTable.ended_at)))
        .orderBy(desc(DevIntelSessionTable.started_at))
        .limit(1),
    )
    return row ? rowToSession(row) : undefined
  })
}

export function findById(id: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const row = yield* db.get<SessionRowRaw>(
      db.select().from(DevIntelSessionTable).where(eq(DevIntelSessionTable.id, id)),
    )
    return row ? rowToSession(row) : undefined
  })
}

export function findRecentByProject(projectId: string, limit: number = 10) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const rows = yield* db.all<SessionRowRaw>(
      db
        .select()
        .from(DevIntelSessionTable)
        .where(eq(DevIntelSessionTable.project_id, projectId))
        .orderBy(desc(DevIntelSessionTable.started_at))
        .limit(limit),
    )
    return rows.map(rowToSession)
  })
}

export function endSession(id: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const now = Date.now()
    yield* db.run(
      db
        .update(DevIntelSessionTable)
        .set({ ended_at: now, time_updated: now })
        .where(eq(DevIntelSessionTable.id, id)),
    )
  })
}

function appendToJSONArray(id: string, column: "files_touched" | "tools_used", value: string) {
  return Effect.gen(function* () {
    const session = yield* findById(id)
    if (!session) return
    const arr = column === "files_touched" ? session.filesTouched : session.toolsUsed
    if (arr.includes(value)) return
    arr.push(value)
    const { db } = yield* DevIntelDb.Service
    const now = Date.now()
    yield* db.run(
      db
        .update(DevIntelSessionTable)
        .set({ [column]: JSON.stringify(arr), time_updated: now })
        .where(eq(DevIntelSessionTable.id, id)),
    )
  })
}

export function addFileTouch(id: string, filePath: string) {
  return appendToJSONArray(id, "files_touched", filePath)
}

export function addToolUsage(id: string, toolName: string) {
  return appendToJSONArray(id, "tools_used", toolName)
}

export function incrementMessageCount(id: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const now = Date.now()
    yield* db.run(
      db
        .update(DevIntelSessionTable)
        .set({ messages_sent: sql`messages_sent + 1`, time_updated: now })
        .where(eq(DevIntelSessionTable.id, id)),
    )
  })
}

export function attachTask(id: string, taskId: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const now = Date.now()
    yield* db.run(
      db
        .update(DevIntelSessionTable)
        .set({ current_task_id: taskId, time_updated: now })
        .where(eq(DevIntelSessionTable.id, id)),
    )
  })
}
