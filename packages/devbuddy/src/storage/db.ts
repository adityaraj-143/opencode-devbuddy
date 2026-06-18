export * as DevBuddyDb from "./db"

import { sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { applyMigrations } from "./migration"
import { join } from "path"
import { Global } from "@opencode-ai/core/global"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

type DatabaseShape = Effect.Success<typeof makeDb>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devbuddy/Database") {}

const initLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDb

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")

    const tables = yield* db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    if (!tables.some((t) => t.name === "dev_buddy_project")) {
      yield* applyMigrations(db)
    } else {
      yield* applyMigrations(db)
    }

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return initLayer.pipe(Layer.provide(SqliteClient.layer({ filename })))
}

export const defaultLayer = Layer.unwrap(
  Effect.gen(function* () {
    return layerFromPath(join(Global.Path.data, "devbuddy.db"))
  }),
)
