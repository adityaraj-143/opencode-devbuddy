export * as DevBuddyProjectStore from "./project-store"

import { Effect } from "effect"
import { DevBuddyProjectTable } from "./schema.sql"
import { DevBuddyDb } from "./db"
import type { InferSelectModel } from "drizzle-orm"
import { eq } from "drizzle-orm"

type ProjectRowRaw = InferSelectModel<typeof DevBuddyProjectTable>

export interface ProjectRow {
  id: string
  opencodeProjectID?: string
  worktreePath: string
  name: string
  vcsType: string
  vcsRemote?: string
  lastOpenedAt?: number
  timesOpened: number
  timeCreated: number
  timeUpdated: number
}

function rowToProject(row: typeof DevBuddyProjectTable.$inferSelect): ProjectRow {
  return {
    id: row.id,
    opencodeProjectID: row.opencode_project_id ?? undefined,
    worktreePath: row.worktree_path,
    name: row.name,
    vcsType: row.vcs_type,
    vcsRemote: row.vcs_remote ?? undefined,
    lastOpenedAt: row.last_opened_at ?? undefined,
    timesOpened: row.times_opened,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }
}

export function findAll() {
  return Effect.gen(function* () {
    const { db } = yield* DevBuddyDb.Service
    const rows = yield* db.all<ProjectRowRaw>(db.select().from(DevBuddyProjectTable))
    return rows.map(rowToProject)
  })
}

export function findById(id: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevBuddyDb.Service
    const row = yield* db.get<ProjectRowRaw>(db.select().from(DevBuddyProjectTable).where(eq(DevBuddyProjectTable.id, id)))
    return row ? rowToProject(row) : undefined
  })
}

export function findByWorktree(worktreePath: string) {
  return Effect.gen(function* () {
    const { db } = yield* DevBuddyDb.Service
    const row = yield* db.get<ProjectRowRaw>(
      db.select().from(DevBuddyProjectTable).where(eq(DevBuddyProjectTable.worktree_path, worktreePath)),
    )
    return row ? rowToProject(row) : undefined
  })
}

export function upsert(input: {
  id: string
  opencodeProjectID?: string
  worktreePath: string
  name: string
  vcsType?: string
  vcsRemote?: string
}) {
  return Effect.gen(function* () {
    const { db } = yield* DevBuddyDb.Service
    const now = Date.now()
    const existing = yield* findByWorktree(input.worktreePath)
    if (existing) {
      yield* db.run(
        db
          .update(DevBuddyProjectTable)
          .set({
            opencode_project_id: input.opencodeProjectID ?? existing.opencodeProjectID,
            name: input.name,
            vcs_type: input.vcsType ?? existing.vcsType,
            vcs_remote: input.vcsRemote ?? existing.vcsRemote,
            last_opened_at: now,
            times_opened: existing.timesOpened + 1,
            time_updated: now,
          })
          .where(eq(DevBuddyProjectTable.id, existing.id)),
      )
      return existing.id
    }
    yield* db.run(
      db.insert(DevBuddyProjectTable).values({
        id: input.id,
        opencode_project_id: input.opencodeProjectID,
        worktree_path: input.worktreePath,
        name: input.name,
        vcs_type: input.vcsType ?? "git",
        vcs_remote: input.vcsRemote,
        last_opened_at: now,
        times_opened: 1,
        time_created: now,
        time_updated: now,
      }),
    )
    return input.id
  })
}
