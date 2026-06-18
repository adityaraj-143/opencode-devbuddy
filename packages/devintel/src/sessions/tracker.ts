export * as DevIntelSessionTracker from "./tracker"

import { Context, Effect } from "effect"
import { readFile } from "fs/promises"
import { join } from "path"
import { DevIntelSessionStore } from "./store"
import { DevIntelProjects } from "../projects/registry"
import { createID } from "../core/id"
import { ProjectNotFound } from "../core/errors"
import { EventV2 } from "@opencode-ai/core/event"
import type { DevIntelSession } from "./types"

async function detectBranch(worktreePath: string): Promise<string | undefined> {
  try {
    const head = await readFile(join(worktreePath, ".git", "HEAD"), "utf-8")
    const match = head.match(/^ref: refs\/heads\/(.+)$/m)
    return match?.[1]
  } catch {
    return undefined
  }
}

export interface Interface {
  readonly startSession: (projectId: string, branch?: string) => Effect.Effect<string, any, any>
  readonly endSession: (sessionId: string) => Effect.Effect<void, any, any>
  readonly getActiveSession: (projectId: string) => Effect.Effect<DevIntelSession | undefined, any, any>
  readonly recordToolUsage: (sessionId: string, toolName: string) => Effect.Effect<void, any, any>
  readonly recordFileTouch: (sessionId: string, filePath: string) => Effect.Effect<void, any, any>
  readonly recordMessage: (sessionId: string) => Effect.Effect<void, any, any>
  readonly attachTask: (sessionId: string, taskId: string) => Effect.Effect<void, any, any>
  readonly getRecentSessions: (projectId: string, limit?: number) => Effect.Effect<DevIntelSession[], any, any>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devintel/SessionTracker") {}

function worktreePath(projectId: string) {
  return Effect.gen(function* () {
    const projects = yield* DevIntelProjects.Service
    const project = yield* projects.get(projectId)
    if (!project) return yield* Effect.fail(new ProjectNotFound({ projectID: projectId }))
    return project.worktreePath
  })
}

function resolveBranch(projectId: string, explicitBranch?: string) {
  return Effect.gen(function* () {
    if (explicitBranch) return explicitBranch
    const path = yield* worktreePath(projectId)
    const branch = yield* Effect.promise(() => detectBranch(path))
    return branch
  })
}

const _startSession = Effect.fn("DevIntelSessionTracker.startSession")(function* (projectId: string, branch?: string) {
  const resolvedBranch = yield* resolveBranch(projectId, branch)
  return yield* DevIntelSessionStore.insert({
    id: createID("dis"),
    projectId,
    activeBranch: resolvedBranch,
  })
})

const _endSession = Effect.fn("DevIntelSessionTracker.endSession")(function* (sessionId: string) {
  yield* DevIntelSessionStore.endSession(sessionId)
})

const _getActiveSession = Effect.fn("DevIntelSessionTracker.getActiveSession")(
  function* (projectId: string) {
    return yield* DevIntelSessionStore.findActiveByProject(projectId)
  },
)

const _recordToolUsage = Effect.fn("DevIntelSessionTracker.recordToolUsage")(
  function* (sessionId: string, toolName: string) {
    yield* DevIntelSessionStore.addToolUsage(sessionId, toolName)
  },
)

const _recordFileTouch = Effect.fn("DevIntelSessionTracker.recordFileTouch")(
  function* (sessionId: string, filePath: string) {
    yield* DevIntelSessionStore.addFileTouch(sessionId, filePath)
  },
)

const _recordMessage = Effect.fn("DevIntelSessionTracker.recordMessage")(function* (sessionId: string) {
  yield* DevIntelSessionStore.incrementMessageCount(sessionId)
})

const _attachTask = Effect.fn("DevIntelSessionTracker.attachTask")(function* (sessionId: string, taskId: string) {
  yield* DevIntelSessionStore.attachTask(sessionId, taskId)
})

const _getRecentSessions = Effect.fn("DevIntelSessionTracker.getRecentSessions")(
  function* (projectId: string, limit?: number) {
    return yield* DevIntelSessionStore.findRecentByProject(projectId, limit)
  },
)

export const layer: Effect.Effect<Interface> = Effect.sync(() =>
  Service.of({
    startSession: (projectId, branch) => _startSession(projectId, branch),
    endSession: (sessionId) => _endSession(sessionId),
    getActiveSession: (projectId) => _getActiveSession(projectId),
    recordToolUsage: (sessionId, toolName) => _recordToolUsage(sessionId, toolName),
    recordFileTouch: (sessionId, filePath) => _recordFileTouch(sessionId, filePath),
    recordMessage: (sessionId) => _recordMessage(sessionId),
    attachTask: (sessionId, taskId) => _attachTask(sessionId, taskId),
    getRecentSessions: (projectId, limit) => _getRecentSessions(projectId, limit),
  }) as unknown as Interface,
)

export function observe() {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const projects = yield* DevIntelProjects.Service
    const sessions = yield* Service
    yield* Effect.acquireRelease(
      events.listen((event) =>
        Effect.gen(function* () {
          if (!event.location?.directory) return
          const directory = event.location.directory
          const projectId = yield* projects.ensureRegistered(directory)

          const session = yield* sessions.getActiveSession(projectId)
          const sid = session?.id

          switch (event.type) {
            case "session.next.prompt.admitted": {
              if (sid) {
                yield* sessions.recordMessage(sid)
              } else {
                const newSid = yield* sessions.startSession(projectId)
                yield* sessions.recordMessage(newSid)
              }
              break
            }
            case "session.next.tool.called": {
              if (sid) {
                const data = event.data as { tool: string }
                yield* sessions.recordToolUsage(sid, data.tool)
              }
              break
            }
            case "session.next.tool.success": {
              if (sid) {
                const data = event.data as { outputPaths?: string[] }
                if (data.outputPaths) {
                  for (const path of data.outputPaths) {
                    yield* sessions.recordFileTouch(sid, path)
                  }
                }
              }
              break
            }
          }
        }) as Effect.Effect<void>,
      ),
      (unsubscribe) => unsubscribe,
    )
  })
}
