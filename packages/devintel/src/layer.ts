export * as DevIntelLayer from "./layer"

import { Effect, Layer } from "effect"
import { DevIntelDb } from "./storage/db"
import { DevIntelProjects } from "./projects/registry"
import { DevIntelProjectMemory } from "./memory/project-memory"
import { DevIntelSessionObserver } from "./observer/session-observer"

const observerLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* DevIntelSessionObserver.observe()
  }),
)

export const layer: Layer.Layer<any, never, never> = Layer.mergeAll(
  DevIntelDb.defaultLayer,
  Layer.effect(DevIntelProjects.Service, DevIntelProjects.layer),
  Layer.effect(DevIntelProjectMemory.Service, DevIntelProjectMemory.layer),
).pipe(
  Layer.provideMerge(observerLayer),
) as any
