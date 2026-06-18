export * as DevIntelLayer from "./layer"

import { Effect, Layer } from "effect"
import { DevIntelDb } from "./storage/db"
import { DevIntelProjects } from "./projects/registry"
import { DevIntelProjectMemory } from "./memory/project-memory"
import { DevIntelSessionTracker } from "./sessions/tracker"
import { DevIntelSessionObserver } from "./observer/session-observer"

const observerLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* DevIntelSessionObserver.observe()
  }),
)

const sessionObserverLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* DevIntelSessionTracker.observe()
  }),
)

export const layer: Layer.Layer<any, never, never> = Layer.mergeAll(
  DevIntelDb.defaultLayer,
  Layer.effect(DevIntelProjects.Service, DevIntelProjects.layer),
  Layer.effect(DevIntelProjectMemory.Service, DevIntelProjectMemory.layer),
  Layer.effect(DevIntelSessionTracker.Service, DevIntelSessionTracker.layer),
).pipe(
  Layer.provideMerge(observerLayer),
  Layer.provideMerge(sessionObserverLayer),
) as any
