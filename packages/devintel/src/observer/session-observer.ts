export * as DevIntelSessionObserver from "./session-observer"

import { Effect } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { DevIntelProjects } from "../projects/registry"

export function observe() {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const projects = yield* DevIntelProjects.Service
    yield* Effect.acquireRelease(
      events.listen((event) =>
        Effect.gen(function* () {
          if (event.type !== "SessionEvent.PromptLifecycle.Admitted") return
          const location = event.location
          if (!location || !("directory" in location)) return
          const directory = (location as { directory: string }).directory
          yield* projects.ensureRegistered(directory)
        }) as Effect.Effect<void>,
      ),
      (unsubscribe) => unsubscribe,
    )
  })
}
