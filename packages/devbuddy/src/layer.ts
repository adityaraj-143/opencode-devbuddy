export * as DevBuddyLayer from "./layer"

import { Effect, Layer } from "effect"
import { DevBuddyDb } from "./storage/db"
import { DevBuddyProjects } from "./projects/registry"
import { DevBuddyProjectMemory } from "./memory/project-memory"
import { DevBuddySessionTracker } from "./sessions/tracker"
import { DevBuddySessionObserver } from "./observer/session-observer"

const observerLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* DevBuddySessionObserver.observe()
  }),
)

const sessionObserverLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* DevBuddySessionTracker.observe()
  }),
)

export const layer: Layer.Layer<any, never, never> = Layer.mergeAll(
  DevBuddyDb.defaultLayer,
  Layer.effect(DevBuddyProjects.Service, DevBuddyProjects.layer),
  Layer.effect(DevBuddyProjectMemory.Service, DevBuddyProjectMemory.layer),
  Layer.effect(DevBuddySessionTracker.Service, DevBuddySessionTracker.layer),
).pipe(
  Layer.provideMerge(observerLayer),
  Layer.provideMerge(sessionObserverLayer),
) as any
