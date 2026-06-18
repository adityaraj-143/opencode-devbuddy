import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { DevBuddyDb } from "../src/storage/db"
import { DevBuddyProjects } from "../src/projects/registry"
import { DevBuddyProjectMemory } from "../src/memory/project-memory"
import type { ProjectMemory, Task, Decision, Note } from "../src/memory/types"

const testLayer = Layer.mergeAll(
  DevBuddyDb.layerFromPath(":memory:"),
  Layer.effect(DevBuddyProjects.Service, DevBuddyProjects.layer),
  Layer.effect(DevBuddyProjectMemory.Service, DevBuddyProjectMemory.layer),
)

let runtime: ManagedRuntime.ManagedRuntime<any, any>
let tmpDir: string

beforeAll(() => {
  runtime = ManagedRuntime.make(testLayer as any)
  tmpDir = mkdtempSync(join(tmpdir(), "devbuddy-memory-test-"))
})

afterAll(() => {
  runtime.dispose()
  rmSync(tmpDir, { recursive: true, force: true })
})

const runTest = <A>(effect: Effect.Effect<A, any, any>) =>
  runtime.runPromise(effect as any) as Promise<A>

function projects() {
  return DevBuddyProjects.Service.pipe(Effect.flatMap((svc) => svc as any))
}

function memory() {
  return DevBuddyProjectMemory.Service.pipe(Effect.flatMap((svc) => svc as any))
}

describe("DevBuddyProjectMemory", () => {
  let projectId: string

  beforeAll(async () => {
    const svc = await runTest(DevBuddyProjects.Service)
    projectId = await runTest(svc.register(tmpDir, "test-project"))
  })

  it("initializes .devbuddy directory and files", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    await runTest(svc.initialize(projectId))

    const mem = await runTest(svc.getProjectMemory(projectId))
    expect(mem.metadata.name).toBe("")
    expect(mem.metadata.goals).toEqual([])
    expect(mem.tasks).toEqual([])
    expect(mem.decisions).toEqual([])
    expect(mem.notes).toEqual([])
  })

  it("is idempotent — repeated initialize does not overwrite", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    await runTest(svc.updateMetadata(projectId, { name: "my-project" }))
    await runTest(svc.initialize(projectId))

    const mem = await runTest(svc.getProjectMemory(projectId))
    expect(mem.metadata.name).toBe("my-project")
  })

  it("updateMetadata persists changes", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    const updated = await runTest(
      svc.updateMetadata(projectId, {
        name: "my-project",
        description: "A test project",
        goals: ["finish phase 2", "write tests"],
        constraints: ["no external deps"],
      }),
    )
    expect(updated.name).toBe("my-project")
    expect(updated.goals).toHaveLength(2)
    expect(updated.constraints).toHaveLength(1)

    const mem = await runTest(svc.getProjectMemory(projectId))
    expect(mem.metadata.name).toBe("my-project")
  })

  it("addTask creates a task with todo status", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    const task = await runTest(svc.addTask(projectId, { title: "Implement memory", description: "Build the FS layer" }))
    expect(task.id).toStartWith("t_")
    expect(task.title).toBe("Implement memory")
    expect(task.status).toBe("todo")
  })

  it("updateTask changes status and title", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    const task = await runTest(svc.addTask(projectId, { title: "Fix bug" }))
    const updated = await runTest(svc.updateTask(projectId, task.id, { status: "active", title: "Fix critical bug" }))
    expect(updated.status).toBe("active")
    expect(updated.title).toBe("Fix critical bug")

    const mem = await runTest(svc.getProjectMemory(projectId))
    const found = mem.tasks.find((t) => t.id === task.id)
    expect(found?.status).toBe("active")
  })

  it("addDecision stores architectural decisions", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    const decision = await runTest(
      svc.addDecision(projectId, { title: "Use file-based storage", rationale: "Human-editable JSON files" }),
    )
    expect(decision.id).toStartWith("d_")
    expect(decision.title).toBe("Use file-based storage")
    expect(decision.rationale).toBe("Human-editable JSON files")

    const mem = await runTest(svc.getProjectMemory(projectId))
    expect(mem.decisions).toHaveLength(1)
  })

  it("addNote stores developer notes", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    const note = await runTest(svc.addNote(projectId, "Remember to check the edge cases"))
    expect(note.id).toStartWith("n_")
    expect(note.content).toBe("Remember to check the edge cases")

    const mem = await runTest(svc.getProjectMemory(projectId))
    expect(mem.notes).toHaveLength(1)
  })

  it("fails for unknown project ID", async () => {
    const svc = await runTest(DevBuddyProjectMemory.Service)
    expect(runTest(svc.initialize("dbp_nonexistent"))).rejects.toThrow()
  })
})
