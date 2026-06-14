export * as DevIntelProjects from "./registry"

import { Effect, Ref, Context } from "effect"
import { DevIntelProjectStore } from "../storage/project-store"
import { DevIntelScanner } from "./scanner"
import { createID } from "../core/id"

export interface Interface {
  readonly register: (worktreePath: string, name?: string) => Effect.Effect<string, any, any>
  readonly list: () => Effect.Effect<DevIntelProjectStore.ProjectRow[], any, any>
  readonly get: (projectID: string) => Effect.Effect<DevIntelProjectStore.ProjectRow | undefined, any, any>
  readonly ensureRegistered: (worktreePath: string) => Effect.Effect<string, any, any>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devintel/Projects") {}

export const layer: Effect.Effect<Interface, any, any> = Effect.gen(function* () {
  yield* Ref.make<string | undefined>(undefined)

  const _register = Effect.fn("DevIntelProjects.register")(function* (worktreePath: string, name?: string) {
    const meta = yield* DevIntelScanner.scan(worktreePath)
    return yield* DevIntelProjectStore.upsert({
      id: createID("dip"),
      worktreePath,
      name: name ?? meta.name ?? worktreePath.split("/").pop() ?? "unknown",
      vcsType: meta.vcsType,
      vcsRemote: meta.vcsRemote,
    })
  })

  const _list = Effect.fn("DevIntelProjects.list")(function* () {
    return yield* DevIntelProjectStore.findAll()
  })

  const _get = Effect.fn("DevIntelProjects.get")(function* (projectID: string) {
    return yield* DevIntelProjectStore.findById(projectID)
  })

  const _ensureRegistered = Effect.fn("DevIntelProjects.ensureRegistered")(function* (worktreePath: string) {
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
    return yield* _register(worktreePath)
  })

  return Service.of({
    register: _register,
    list: _list,
    get: _get,
    ensureRegistered: _ensureRegistered,
  }) as Interface
})
