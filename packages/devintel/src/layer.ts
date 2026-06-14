export * as DevIntelLayer from "./layer"

import { Effect, Layer, Scope } from "effect"
import { DevIntelDb } from "./storage/db"
import { DevIntelProjects } from "./projects/registry"
import { DevIntelSessionTracker } from "./sessions/tracker"
import { DevIntelSessionObserver } from "./observer/session-observer"

const observerLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Scope.addFinalizer(Effect.void)
    yield* DevIntelSessionObserver.observe()
  }),
)

export const layer = Layer.mergeAll(
  DevIntelDb.defaultLayer,
  Layer.effect(DevIntelProjects.Service, DevIntelProjects.layer),
  Layer.effect(DevIntelSessionTracker.Service, DevIntelSessionTracker.layer),
).pipe(
  Layer.provideMerge(observerLayer),
)
