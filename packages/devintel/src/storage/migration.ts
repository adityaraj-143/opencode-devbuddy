import { sql } from "drizzle-orm"
import { Effect } from "effect"
import type { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { initialSchema } from "./migrations/001_project_table"
import { sessionSchema } from "./migrations/002_dev_intel_session"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
type Migration = { id: string; up: (tx: Transaction) => Effect.Effect<void, unknown, unknown> }

const migrations: Migration[] = [initialSchema, sessionSchema]

export function applyMigrations(db: Database) {
  return Effect.gen(function* () {
    yield* db.run(
      sql`CREATE TABLE IF NOT EXISTS ${sql.identifier("dev_intel_migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
    )
    const completed = new Set(
      (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("dev_intel_migration")}`)).map((r) => r.id),
    )
    for (const m of migrations) {
      if (completed.has(m.id)) continue
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* m.up(tx)
          yield* tx.run(
            sql`INSERT INTO ${sql.identifier("dev_intel_migration")} (id, time_completed) VALUES (${m.id}, ${Date.now()})`,
          )
        }),
      )
    }
  })
}
