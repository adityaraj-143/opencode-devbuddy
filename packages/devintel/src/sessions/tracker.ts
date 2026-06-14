export * as DevIntelSessionTracker from "./tracker"

import { Effect, Ref, Context } from "effect"
import { DevIntelSessionStore } from "../storage/session-store"

export interface ActiveSession {
  devIntelSessionID: string
  opencodeSessionID: string
  startedAt: number
}

export interface Interface {
  readonly startTracking: (opencodeSessionID: string, devIntelSessionID: string) => Effect.Effect<void>
  readonly endTracking: (opencodeSessionID: string) => Effect.Effect<void>
  readonly getActive: () => Effect.Effect<ActiveSession | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devintel/SessionTracker") {}

export const layer = Effect.gen(function* () {
  const active = yield* Ref.make<Map<string, ActiveSession>>(new Map())

  return Service.of({
    startTracking: Effect.fn("DevIntelSessionTracker.startTracking")(function* (opencodeSessionID, devIntelSessionID) {
      const session: ActiveSession = { devIntelSessionID, opencodeSessionID, startedAt: Date.now() }
      yield* Ref.update(active, (map) => new Map(map).set(opencodeSessionID, session))
    }),
    endTracking: Effect.fn("DevIntelSessionTracker.endTracking")(function* (opencodeSessionID) {
      const map = yield* Ref.get(active)
      const session = map.get(opencodeSessionID)
      if (session) {
        yield* DevIntelSessionStore.updateEnd(session.devIntelSessionID)
        yield* Ref.update(active, (m) => {
          const next = new Map(m)
          next.delete(opencodeSessionID)
          return next
        })
      }
    }),
    getActive: Effect.fn("DevIntelSessionTracker.getActive")(function* () {
      const map = yield* Ref.get(active)
      const sessions = Array.from(map.values())
      if (sessions.length === 0) return undefined
      return sessions.reduce((latest, s) => (s.startedAt > latest.startedAt ? s : latest))
    }),
  })
})
