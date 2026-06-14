export * as DevIntelMemoryStore from "./memory-store"

import { Effect } from "effect"
import { DevIntelMemoryEntryTable } from "./schema.sql"
import { DevIntelDb } from "./db"
import { eq, and, desc } from "drizzle-orm"

export interface MemoryRow {
  id: string
  projectID?: string
  sessionID?: string
  memoryType: string
  content: unknown
  source: string
  importance: number
  accessCount: number
  lastAccessedAt?: number
  timeCreated: number
  timeUpdated: number
}

function rowToMemory(row: typeof DevIntelMemoryEntryTable.$inferSelect): MemoryRow {
  return {
    id: row.id,
    projectID: row.project_id ?? undefined,
    sessionID: row.session_id ?? undefined,
    memoryType: row.memory_type,
    content: row.content as unknown,
    source: row.source,
    importance: row.importance,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at ?? undefined,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

export function findByProject(projectID: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const rows = yield* db.all(
      db
        .select()
        .from(DevIntelMemoryEntryTable)
        .where(eq(DevIntelMemoryEntryTable.project_id, projectID))
        .orderBy(desc(DevIntelMemoryEntryTable.importance)),
    )
    return rows.map(rowToMemory)
  })
}

export function findBySession(sessionID: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const rows = yield* db.all(
      db
        .select()
        .from(DevIntelMemoryEntryTable)
        .where(eq(DevIntelMemoryEntryTable.session_id, sessionID)),
    )
    return rows.map(rowToMemory)
  })
}

export function create(input: {
  id: string
  projectID?: string
  sessionID?: string
  memoryType: string
  content: unknown
  source?: string
  importance?: number
}) {
  return Effect.gen(function* () {
    const { db } = yield* DevIntelDb.Service
    const now = Date.now()
    yield* db.run(
      db.insert(DevIntelMemoryEntryTable).values({
        id: input.id,
        project_id: input.projectID,
        session_id: input.sessionID,
        memory_type: input.memoryType,
        content: input.content as Record<string, unknown>,
        source: input.source ?? "observation",
        importance: input.importance ?? 0.5,
        time_created: now,
        time_updated: now,
      }),
    )
  })
}
