import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { DevBuddyDb } from "../src/storage/db"
import { DevBuddyProjects } from "../src/projects/registry"
import { DevBuddySessionTracker } from "../src/sessions/tracker"
import { DevBuddySessionStore } from "../src/sessions/store"

const testLayer = Layer.mergeAll(
  DevBuddyDb.layerFromPath(":memory:"),
  Layer.effect(DevBuddyProjects.Service as any, DevBuddyProjects.layer as any),
  Layer.effect(DevBuddySessionTracker.Service as any, DevBuddySessionTracker.layer as any),
) as any

let runtime: ManagedRuntime.ManagedRuntime<any, any>
let tmpDir: string
let tmpDir2: string
let projectId: string
let projectId2: string
let svc: any

beforeAll(async () => {
  runtime = ManagedRuntime.make(testLayer as any)
  tmpDir = mkdtempSync(join(tmpdir(), "devbuddy-session-test-"))
  tmpDir2 = mkdtempSync(join(tmpdir(), "devbuddy-session-test-2-"))
  const ps: any = await runtime.runPromise(DevBuddyProjects.Service as any)
  projectId = await runtime.runPromise(ps.register(tmpDir, "session-test-project"))
  projectId2 = await runtime.runPromise(ps.register(tmpDir2, "session-test-project-2"))
  svc = await runtime.runPromise(DevBuddySessionTracker.Service as any)
})

afterAll(() => {
  runtime.dispose()
  rmSync(tmpDir, { recursive: true, force: true })
  rmSync(tmpDir2, { recursive: true, force: true })
})

const run = <A>(effect: any) => runtime.runPromise(effect) as Promise<A>

describe("DevBuddySessionTracker", () => {
  it("startSession creates a new session and returns an ID", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    expect(sid).toBeString()
    expect(sid).toStartWith("dbs_")
  })

  it("getActiveSession returns the active session", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    const active = await run<any>(svc.getActiveSession(projectId))
    expect(active).toBeDefined()
    expect(active.id).toBe(sid)
    expect(active.endedAt).toBeUndefined()
  })

  it("endSession marks the session as ended", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    await run<void>(svc.endSession(sid))
    const ended = await run<any>(DevBuddySessionStore.findById(sid))
    expect(ended.endedAt).toBeDefined()
    expect(ended.duration).toBeGreaterThanOrEqual(0)
  })

  it("ended session no longer appears as active", async () => {
    const sid = await run<string>(svc.startSession(projectId2))
    await run<void>(svc.endSession(sid))
    const active = await run<any>(svc.getActiveSession(projectId2))
    expect(active).toBeUndefined()
  })

  it("recordToolUsage records tool names", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    await run<void>(svc.recordToolUsage(sid, "Bash"))
    await run<void>(svc.recordToolUsage(sid, "Read"))
    const row = await run<any>(DevBuddySessionStore.findById(sid))
    expect(row.toolsUsed).toEqual(["Bash", "Read"])
  })

  it("recordToolUsage deduplicates same tool", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    await run<void>(svc.recordToolUsage(sid, "Bash"))
    await run<void>(svc.recordToolUsage(sid, "Bash"))
    const row = await run<any>(DevBuddySessionStore.findById(sid))
    expect(row.toolsUsed).toEqual(["Bash"])
  })

  it("recordFileTouch records file paths", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    await run<void>(svc.recordFileTouch(sid, "src/main.ts"))
    await run<void>(svc.recordFileTouch(sid, "src/utils.ts"))
    const row = await run<any>(DevBuddySessionStore.findById(sid))
    expect(row.filesTouched).toEqual(["src/main.ts", "src/utils.ts"])
  })

  it("recordFileTouch deduplicates same path", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    await run<void>(svc.recordFileTouch(sid, "src/main.ts"))
    await run<void>(svc.recordFileTouch(sid, "src/main.ts"))
    const row = await run<any>(DevBuddySessionStore.findById(sid))
    expect(row.filesTouched).toEqual(["src/main.ts"])
  })

  it("recordMessage increments message count", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    await run<void>(svc.recordMessage(sid))
    await run<void>(svc.recordMessage(sid))
    const row = await run<any>(DevBuddySessionStore.findById(sid))
    expect(row.messagesSent).toBe(2)
  })

  it("attachTask sets the current task ID", async () => {
    const sid = await run<string>(svc.startSession(projectId))
    await run<void>(svc.attachTask(sid, "t_abc123"))
    const row = await run<any>(DevBuddySessionStore.findById(sid))
    expect(row.currentTaskId).toBe("t_abc123")
  })

  it("getRecentSessions returns sessions ordered by recency", async () => {
    const sid1 = await run<string>(svc.startSession(projectId))
    await run<void>(svc.endSession(sid1))
    const sid2 = await run<string>(svc.startSession(projectId))
    const recent = await run<any[]>(svc.getRecentSessions(projectId, 5))
    expect(recent.length).toBeGreaterThanOrEqual(2)
    expect(recent[0].id).toBe(sid2)
  })

  it("startSession detects branch from .git/HEAD", async () => {
    mkdirSync(join(tmpDir, ".git"), { recursive: true })
    writeFileSync(join(tmpDir, ".git", "HEAD"), "ref: refs/heads/feature-branch\n")
    const sid = await run<string>(svc.startSession(projectId))
    const row = await run<any>(DevBuddySessionStore.findById(sid))
    expect(row.activeBranch).toBe("feature-branch")
  })

  it("fails for unknown project ID", async () => {
    expect(run<any>(svc.startSession("dbp_nonexistent"))).rejects.toThrow()
  })
})
