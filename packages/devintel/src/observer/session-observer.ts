export * as DevIntelSessionObserver from "./session-observer"

import { Effect, Scope } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { DevIntelProjects } from "../projects/registry"
import { DevIntelSessionStore } from "../storage/session-store"
import { createID } from "../core/id"

export function observe() {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    yield* Effect.acquireRelease(
      events.listen((event) =>
        Effect.gen(function* () {
          if (event.type !== "SessionEvent.PromptLifecycle.Admitted") return
          const location = event.location
          if (!location || !("directory" in location)) return

          const directory = (location as { directory: string }).directory
          const projectID = yield* DevIntelProjects.ensureRegistered(directory)
          const existing = yield* DevIntelSessionStore.findByOpenCodeID(event.id)
          const sessionID = existing?.id ?? createID("dis")
          if (!existing) {
            yield* DevIntelSessionStore.create({
              id: sessionID,
              opencodeSessionID: event.id,
              projectID,
            })
          }
          yield* DevIntelSessionStore.incrementMessageCount(sessionID)
        }),
      ),
      (unsubscribe) => unsubscribe,
    )
  })
}
