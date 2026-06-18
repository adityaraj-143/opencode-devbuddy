import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { DevBuddyDb } from "../src/storage/db"
import { DevBuddyProjects } from "../src/projects/registry"
import type { DevBuddyProjectStore } from "../src/storage/project-store"

const testLayer = Layer.mergeAll(
  DevBuddyDb.layerFromPath(":memory:"),
  Layer.effect(DevBuddyProjects.Service, DevBuddyProjects.layer),
)

let runtime: ManagedRuntime.ManagedRuntime<any, any>

beforeAll(() => {
  runtime = ManagedRuntime.make(testLayer as any)
})

afterAll(() => {
  runtime.dispose()
})

const runTest = <A>(effect: Effect.Effect<A, any, any>) =>
  runtime.runPromise(effect as any) as Promise<A>

describe("DevBuddyProjects", () => {
  let registeredId: string

  it("registers a project and retrieves it", async () => {
    const worktreePath = process.cwd()
    const id = await runTest<string>(
      DevBuddyProjects.Service.pipe(Effect.flatMap((svc) => svc.register(worktreePath, "test-project"))),
    )
    expect(id).toBeString()
    expect(id).toStartWith("dbp_")
    registeredId = id

    const projects = await runTest<DevBuddyProjectStore.ProjectRow[]>(
      DevBuddyProjects.Service.pipe(Effect.flatMap((svc) => svc.list())),
    )
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe("test-project")
    expect(projects[0].worktreePath).toBe(worktreePath)
  })

  it("ensureRegistered returns existing project ID on re-registration", async () => {
    const worktreePath = process.cwd()
    const id1 = await runTest<string>(
      DevBuddyProjects.Service.pipe(Effect.flatMap((svc) => svc.ensureRegistered(worktreePath))),
    )
    const id2 = await runTest<string>(
      DevBuddyProjects.Service.pipe(Effect.flatMap((svc) => svc.ensureRegistered(worktreePath))),
    )
    expect(id1).toBe(id2)
  })

  it("get returns project by ID", async () => {
    const project = await runTest<DevBuddyProjectStore.ProjectRow | undefined>(
      DevBuddyProjects.Service.pipe(Effect.flatMap((svc) => svc.get(registeredId))),
    )
    expect(project).toBeDefined()
    expect(project!.id).toBe(registeredId)
  })

  it("get returns undefined for unknown ID", async () => {
    const project = await runTest<DevBuddyProjectStore.ProjectRow | undefined>(
      DevBuddyProjects.Service.pipe(Effect.flatMap((svc) => svc.get("dbp_nonexistent"))),
    )
    expect(project).toBeUndefined()
  })
})
