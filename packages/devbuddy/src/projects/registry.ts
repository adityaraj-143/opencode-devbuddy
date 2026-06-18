export * as DevBuddyProjects from "./registry"

import { Effect, Ref, Context } from "effect"
import { DevBuddyProjectStore } from "../storage/project-store"
import { DevBuddyScanner } from "./scanner"
import { createID } from "../core/id"

export interface Interface {
  readonly register: (worktreePath: string, name?: string) => Effect.Effect<string, any, any>
  readonly list: () => Effect.Effect<DevBuddyProjectStore.ProjectRow[], any, any>
  readonly get: (projectID: string) => Effect.Effect<DevBuddyProjectStore.ProjectRow | undefined, any, any>
  readonly ensureRegistered: (worktreePath: string) => Effect.Effect<string, any, any>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devbuddy/Projects") {}

export const layer: Effect.Effect<Interface, any, any> = Effect.gen(function* () {
  yield* Ref.make<string | undefined>(undefined)

  const _register = Effect.fn("DevBuddyProjects.register")(function* (worktreePath: string, name?: string) {
    const meta = yield* DevBuddyScanner.scan(worktreePath)
    return yield* DevBuddyProjectStore.upsert({
      id: createID("dbp"),
      worktreePath,
      name: name ?? meta.name ?? worktreePath.split("/").pop() ?? "unknown",
      vcsType: meta.vcsType,
      vcsRemote: meta.vcsRemote,
    })
  })

  const _list = Effect.fn("DevBuddyProjects.list")(function* () {
    return yield* DevBuddyProjectStore.findAll()
  })

  const _get = Effect.fn("DevBuddyProjects.get")(function* (projectID: string) {
    return yield* DevBuddyProjectStore.findById(projectID)
  })

  const _ensureRegistered = Effect.fn("DevBuddyProjects.ensureRegistered")(function* (worktreePath: string) {
    const existing = yield* DevBuddyProjectStore.findByWorktree(worktreePath)
    if (existing) {
      yield* DevBuddyProjectStore.upsert({
        id: existing.id,
        worktreePath: existing.worktreePath,
        name: existing.name,
        opencodeProjectID: existing.opencodeProjectID,
        vcsType: existing.vcsType,
        vcsRemote: existing.vcsRemote,
      })
      return existing.id
    }
    return yield* _register(worktreePath)
  })

  return Service.of({
    register: _register,
    list: _list,
    get: _get,
    ensureRegistered: _ensureRegistered,
  }) as Interface
})
