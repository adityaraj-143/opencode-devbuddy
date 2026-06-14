export * as DevIntelProjects from "./registry"

import { Effect, Ref, Context } from "effect"
import { DevIntelProjectStore } from "../storage/project-store"
import { DevIntelScanner } from "./scanner"
import { createID } from "../core/id"

export interface Interface {
  readonly register: (worktreePath: string, name?: string) => Effect.Effect<string>
  readonly list: () => Effect.Effect<DevIntelProjectStore.ProjectRow[]>
  readonly get: (projectID: string) => Effect.Effect<DevIntelProjectStore.ProjectRow | undefined>
  readonly ensureRegistered: (worktreePath: string) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devintel/Projects") {}

export const layer = Effect.gen(function* () {
  const activeProject = yield* Ref.make<string | undefined>(undefined)

  return Service.of({
    register: Effect.fn("DevIntelProjects.register")(function* (worktreePath, name) {
      const meta = yield* DevIntelScanner.scan(worktreePath)
      const projectID = yield* DevIntelProjectStore.upsert({
        id: createID("dip"),
        worktreePath,
        name: name ?? meta.name ?? worktreePath.split("/").pop() ?? "unknown",
        vcsType: meta.vcsType,
        vcsRemote: meta.vcsRemote,
      })
      yield* Ref.set(activeProject, projectID)
      return projectID
    }),
    list: Effect.fn("DevIntelProjects.list")(function* () {
      return yield* DevIntelProjectStore.findAll()
    }),
    get: Effect.fn("DevIntelProjects.get")(function* (projectID) {
      return yield* DevIntelProjectStore.findById(projectID)
    }),
    ensureRegistered: Effect.fn("DevIntelProjects.ensureRegistered")(function* (worktreePath) {
      const existing = yield* DevIntelProjectStore.findByWorktree(worktreePath)
      if (existing) {
        yield* DevIntelProjectStore.upsert({
          id: existing.id,
          worktreePath: existing.worktreePath,
          name: existing.name,
          opencodeProjectID: existing.opencodeProjectID,
          vcsType: existing.vcsType,
          vcsRemote: existing.vcsRemote,
        })
        return existing.id
      }
      return yield* this.register(worktreePath)
    }),
  })
})
