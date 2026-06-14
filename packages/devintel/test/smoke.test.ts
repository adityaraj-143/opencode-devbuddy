import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { DevIntelDb } from "../src/storage/db"
import { DevIntelProjects } from "../src/projects/registry"
import type { DevIntelProjectStore } from "../src/storage/project-store"

const testLayer = Layer.mergeAll(
  DevIntelDb.layerFromPath(":memory:"),
  Layer.effect(DevIntelProjects.Service, DevIntelProjects.layer),
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

describe("DevIntelProjects", () => {
  let registeredId: string

  it("registers a project and retrieves it", async () => {
    const worktreePath = process.cwd()
    const id = await runTest<string>(
      DevIntelProjects.Service.pipe(Effect.flatMap((svc) => svc.register(worktreePath, "test-project"))),
    )
    expect(id).toBeString()
    expect(id).toStartWith("dip_")
    registeredId = id

    const projects = await runTest<DevIntelProjectStore.ProjectRow[]>(
      DevIntelProjects.Service.pipe(Effect.flatMap((svc) => svc.list())),
    )
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe("test-project")
    expect(projects[0].worktreePath).toBe(worktreePath)
  })

  it("ensureRegistered returns existing project ID on re-registration", async () => {
    const worktreePath = process.cwd()
    const id1 = await runTest<string>(
      DevIntelProjects.Service.pipe(Effect.flatMap((svc) => svc.ensureRegistered(worktreePath))),
    )
    const id2 = await runTest<string>(
      DevIntelProjects.Service.pipe(Effect.flatMap((svc) => svc.ensureRegistered(worktreePath))),
    )
    expect(id1).toBe(id2)
  })

  it("get returns project by ID", async () => {
    const project = await runTest<DevIntelProjectStore.ProjectRow | undefined>(
      DevIntelProjects.Service.pipe(Effect.flatMap((svc) => svc.get(registeredId))),
    )
    expect(project).toBeDefined()
    expect(project!.id).toBe(registeredId)
  })

  it("get returns undefined for unknown ID", async () => {
    const project = await runTest<DevIntelProjectStore.ProjectRow | undefined>(
      DevIntelProjects.Service.pipe(Effect.flatMap((svc) => svc.get("dip_nonexistent"))),
    )
    expect(project).toBeUndefined()
  })
})
