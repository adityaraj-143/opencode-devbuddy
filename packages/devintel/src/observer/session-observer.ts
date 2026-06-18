export * as DevIntelSessionObserver from "./session-observer"

import { Effect } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { DevIntelProjects } from "../projects/registry"
import { DevIntelProjectMemory } from "../memory/project-memory"

export function observe() {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const projects = yield* DevIntelProjects.Service
    const memory = yield* DevIntelProjectMemory.Service
    yield* Effect.acquireRelease(
      events.listen((event) =>
        Effect.gen(function* () {
          if (event.type !== "SessionEvent.PromptLifecycle.Admitted") return
          const location = event.location
          if (!location || !("directory" in location)) return
          const directory = (location as { directory: string }).directory
          const projectId = yield* projects.ensureRegistered(directory)
          yield* memory.initialize(projectId)
        }) as Effect.Effect<void>,
      ),
      (unsubscribe) => unsubscribe,
    )
  })
}
