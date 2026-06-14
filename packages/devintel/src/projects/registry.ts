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

export const layer = Effect.gen(function* () {
  yield* Ref.make<string | undefined>(undefined)
  return Service.of({
    register: _register as unknown as (worktreePath: string, name?: string) => Effect.Effect<string>,
    list: _list as unknown as () => Effect.Effect<DevIntelProjectStore.ProjectRow[]>,
    get: _get as unknown as (projectID: string) => Effect.Effect<DevIntelProjectStore.ProjectRow | undefined>,
    ensureRegistered: _ensureRegistered as unknown as (worktreePath: string) => Effect.Effect<string>,
  })
})
