# Phase 1: Project Registry — Implementation Plan

**Purpose:** Track which repositories the developer works on. Establish the foundation for all per-project intelligence.

**Dependencies:** None (standalone — no other Dev-Buddy phases required)

**Success Criteria:**
- Projects are automatically discovered when sessions start in their worktree
- Project registry persists across restarts (SQLite-backed)
- Registered projects are queryable by ID and by worktree path
- TUI sidebar displays a list of registered projects

---

## Implementation Steps

### Step 0: Workspace Registration

Add `packages/devbuddy` to the root workspace catalog if not already present.

| Action | File | Detail |
|--------|------|--------|
| Verify | `package.json` (root) | Confirm `packages/devbuddy` is listed under `workspaces.packages` |

**Dependencies:** None

**Completion:** `bun install` from root succeeds with no errors.

---

### Step 1: Package Foundation

Create the minimal npm package shell.

#### 1a. `packages/devbuddy/package.json`

```json
{
  "name": "@opencode-ai/devbuddy",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@opencode-ai/core": "workspace:*",
    "@opencode-ai/effect-drizzle-sqlite": "workspace:*",
    "@opencode-ai/plugin": "workspace:*",
    "@effect/sql-sqlite-bun": "catalog:",
    "effect": "catalog:",
    "drizzle-orm": "catalog:"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@types/node": "catalog:",
    "@opentui/core": "catalog:",
    "@opentui/solid": "catalog:"
  }
}
```

#### 1b. `packages/devbuddy/tsconfig.json`

```json
{
  "extends": "@tsconfig/bun/tsconfig.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "noUncheckedIndexedAccess": false
  }
}
```

#### 1c. `packages/devbuddy/src/core/types.ts`

Phase-1-relevant types only:

```ts
export type VcsType = "git" | "hg" | "svn" | "none"

export interface ProjectMeta {
  name: string
  hasDevBuddyDir: boolean
  vcsType: VcsType
  vcsRemote?: string
}
```

#### 1d. `packages/devbuddy/src/core/id.ts`

Timestamped-prefix ID generator producing values like `dip_1a2b3c4d5e6f`.

```ts
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

function base62Encode(n: number): string {
  if (n === 0) return "0"
  let result = ""
  while (n > 0) {
    result = BASE62[n % 62] + result
    n = Math.floor(n / 62)
  }
  return result
}

function ascendingTimestamp(): string {
  const now = Date.now()
  const base36 = now.toString(36).padStart(8, "0")
  const random = base62Encode(Math.floor(Math.random() * 62 * 62 * 62 * 62)).padStart(4, "0")
  return base36 + random
}

export function createID(prefix: string): string {
  return `${prefix}_${ascendingTimestamp()}`
}

export function projectID(): string {
  return createID("dip")
}
```

#### 1e. `packages/devbuddy/src/core/errors.ts`

Phase-1-relevant errors only:

```ts
import { Schema } from "effect"

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "DevBuddy.ProjectNotFound",
  { projectID: Schema.String },
) {}

export class DirectoryNotFound extends Schema.TaggedErrorClass<DirectoryNotFound>()(
  "DevBuddy.DirectoryNotFound",
  { path: Schema.String },
) {}
```

#### 1f. `packages/devbuddy/src/index.ts`

Public API barrel — only Phase 1 exports:

```ts
export { DevBuddyLayer } from "./layer"
export { DevBuddyProjectStore } from "./storage/project-store"
export { DevBuddyProjects } from "./projects/registry"
export { DevBuddyScanner } from "./projects/scanner"
export type { ProjectRow } from "./storage/project-store"
export type { ProjectMeta } from "./core/types"
```

#### 1g. `packages/devbuddy/src/schema.ts`

Effect Schema definitions for the Project data type (used by the TUI, API, and storage layers):

```ts
import { Schema } from "effect"
import { VcsType } from "./core/types"

export const Project = Schema.Struct({
  id: Schema.String,
  worktreePath: Schema.String,
  name: Schema.String,
  vcsType: Schema.String,
  vcsRemote: Schema.optional(Schema.String),
  lastOpenedAt: Schema.optional(Schema.Number),
  timesOpened: Schema.Number,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})
export type Project = typeof Project.Type
```

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/package.json` |
| Create | `packages/devbuddy/tsconfig.json` |
| Create | `packages/devbuddy/src/index.ts` |
| Create | `packages/devbuddy/src/schema.ts` |
| Create | `packages/devbuddy/src/core/types.ts` |
| Create | `packages/devbuddy/src/core/id.ts` |
| Create | `packages/devbuddy/src/core/errors.ts` |

**Dependencies:** Step 0

**Completion:** Directory structure exists. `package.json` can be resolved by workspace tooling. All imports compile without errors.

---

### Step 2: Database Schema

Define the single `dev_intel_project` Drizzle table.

**File:** `packages/devbuddy/src/storage/schema.sql.ts`

Table columns:

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `text` | `primaryKey()` |
| `opencode_project_id` | `text` | nullable — FK to OpenCode's `project.id` |
| `worktree_path` | `text` | `notNull()` — absolute path |
| `name` | `text` | `notNull()` |
| `vcs_type` | `text` | `default("git").notNull()` |
| `vcs_remote` | `text` | nullable |
| `last_opened_at` | `integer` | nullable |
| `times_opened` | `integer` | `default(0).notNull()` |
| `time_created` | `integer` | `notNull()` |
| `time_updated` | `integer` | `notNull()` |

Index: none required — queried by `id` (PK) or `worktree_path` (unique scan).

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const DevBuddyProjectTable = sqliteTable("dev_intel_project", {
  id: text().primaryKey(),
  opencode_project_id: text(),
  worktree_path: text().notNull(),
  name: text().notNull(),
  vcs_type: text().default("git").notNull(),
  vcs_remote: text(),
  last_opened_at: integer(),
  times_opened: integer().default(0).notNull(),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
})
```

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/storage/schema.sql.ts` |

**Dependencies:** Step 1 (types.ts not needed by schema, but directory structure must exist)

**Completion:** `dev_intel_project` table is defined as a Drizzle `sqliteTable`. No other tables exist in this file.

---

### Step 3: Migration

#### 3a. Migration Runner

**File:** `packages/devbuddy/src/storage/migration.ts`

A migration system that:
- Creates a `dev_intel_migration` tracking table if absent
- On first run: applies all migrations in order
- On subsequent runs: checks `dev_intel_migration` for completed IDs, applies pending ones

```ts
type Migration = { id: string; up: (tx: Transaction) => Effect.Effect<void> }
```

Exports:
- `applyMigrations(db: Database): Effect.Effect<void>` — runs all pending migrations in a transaction
- `migrations: Migration[]` — ordered list of migration definitions

#### 3b. Phase 1 Migration

**File:** `packages/devbuddy/src/storage/migrations/001_project_table.ts`

Creates only the `dev_intel_project` table:

```sql
CREATE TABLE `dev_intel_project` (
  `id` text PRIMARY KEY,
  `opencode_project_id` text,
  `worktree_path` text NOT NULL,
  `name` text NOT NULL,
  `vcs_type` text DEFAULT 'git' NOT NULL,
  `vcs_remote` text,
  `last_opened_at` integer,
  `times_opened` integer DEFAULT 0 NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL
);
```

Migration ID: `"20260614_001_dev_intel_project"`

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/storage/migration.ts` |
| Create | `packages/devbuddy/src/storage/migrations/` (directory) |
| Create | `packages/devbuddy/src/storage/migrations/001_project_table.ts` |

**Dependencies:** Step 2 (schema.sql.ts for reference, but migration uses raw SQL)

**Completion:** Calling `applyMigrations` creates `dev_intel_project` table and records the migration as completed. Rerunning is idempotent.

---

### Step 4: Database Connection

**File:** `packages/devbuddy/src/storage/db.ts`

Establishes a SQLite connection via `@effect/sql-sqlite-bun` with auto-migration. Uses a separate `devbuddy.db` file at `Global.Path.data` to avoid schema coupling with OpenCode's own database.

Key behaviors:
- Opens WAL mode, sets `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`
- On first connect: detects absence of `dev_intel_project` table, runs full migration chain
- On subsequent connects: runs pending migrations
- Exposes `DevBuddyDb.Service` — a `DatabaseShape` with Drizzle query builder

```ts
export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devbuddy/Database") {}

// Layer that takes a filename (for testability)
export function layerFromPath(filename: string): Layer.Layer<Service>

// Default layer using Global.Path.data + "devbuddy.db"
export const defaultLayer: Layer.Layer<Service>
```

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/storage/db.ts` |

**Dependencies:** Step 3 (migration runner + migration file)

**Completion:** `DevBuddyDb.defaultLayer` provides a working `DatabaseShape` with the `dev_intel_project` table existing. Connection uses WAL mode and auto-migrates.

---

### Step 5: Project Store (CRUD)

**File:** `packages/devbuddy/src/storage/project-store.ts`

Data-access layer for the `dev_intel_project` table. Pure data access — no business logic.

| Function | Signature | Description |
|----------|-----------|-------------|
| `findAll` | `() => Effect.Effect<ProjectRow[]>` | List all registered projects |
| `findById` | `(id: string) => Effect.Effect<ProjectRow \| undefined>` | Lookup by primary key |
| `findByWorktree` | `(path: string) => Effect.Effect<ProjectRow \| undefined>` | Lookup by worktree path |
| `upsert` | `(input: UpsertInput) => Effect.Effect<string>` | Insert or update by worktree path; increments `times_opened` and sets `last_opened_at` on update |

```ts
export interface ProjectRow {
  id: string
  opencodeProjectID?: string
  worktreePath: string
  name: string
  vcsType: string
  vcsRemote?: string
  lastOpenedAt?: number
  timesOpened: number
  createdAt: number
  updatedAt: number
}

export interface UpsertInput {
  id: string
  opencodeProjectID?: string
  worktreePath: string
  name: string
  vcsType?: string
  vcsRemote?: string
}
```

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/storage/project-store.ts` |

**Dependencies:** Step 2 (schema.sql.ts for table reference), Step 4 (db.ts for DB service)

**Completion:** All four CRUD functions work against the `dev_intel_project` table. `upsert` correctly distinguishes insert vs. update by `worktree_path`, and increments counters on update.

---

### Step 6: Project Scanner

**File:** `packages/devbuddy/src/projects/scanner.ts`

Filesystem introspection for a given directory. No DB involvement.

| Function | Signature | Description |
|----------|-----------|-------------|
| `scan` | `(directory: string) => Effect.Effect<ScanResult>` | Detect VCS type and presence of `.devbuddy`/`.opencode` dirs |

```ts
export interface ScanResult {
  name: string
  hasDevBuddy: boolean
  vcsType: string
  vcsRemote?: string
}
```

Scanning logic:
- Check `.git/` directory → `vcsType = "git"`
- Check `.hg/` directory → `vcsType = "hg"`
- Check `.svn/` directory → `vcsType = "svn"`
- Check `.devbuddy/` or `.opencode/` → `hasDevBuddy = true`
- Name derived from directory basename

All filesystem checks use `fs.promises.access()` wrapped in `Effect.promise`.

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/projects/scanner.ts` |

**Dependencies:** Step 1 (core/types.ts for ScanResult type)

**Completion:** `scan()` returns accurate VCS type and Dev-Buddy directory presence for any path. Returns `"none"` for non-VCS directories. Never throws — failures are returned as typed errors.

---

### Step 7: Project Registry (Service)

**File:** `packages/devbuddy/src/projects/registry.ts`

Effect Service that wraps the store and scanner into a business-logic layer. This is what other parts of the system interact with.

```ts
export interface Interface {
  register: (worktreePath: string, name?: string) => Effect.Effect<string>
  list: () => Effect.Effect<ProjectRow[]>
  get: (projectID: string) => Effect.Effect<ProjectRow | undefined>
  ensureRegistered: (worktreePath: string) => Effect.Effect<string>
}
```

| Method | Behavior |
|--------|----------|
| `register` | Scans the directory, upserts into store, returns project ID. Overrides `name` if provided. |
| `list` | Delegates to `ProjectStore.findAll()` |
| `get` | Delegates to `ProjectStore.findById()` |
| `ensureRegistered` | Checks if worktree path is already registered. If yes, returns existing ID. If no, calls `register`. Idempotent. |

```ts
export class Service extends Context.Service<Service, Interface>()("@opencode/v2/devbuddy/Projects") {}

export const layer: Layer.Layer<Service>
```

The layer effect creates the Service, wrapping `DevBuddyProjectStore` and `DevBuddyScanner`.

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/projects/registry.ts` |

**Dependencies:** Step 5 (project-store.ts), Step 6 (scanner.ts), Step 1 (id.ts for ID generation)

**Completion:** `DevBuddyProjects.Service` provides the full project registry API. Calling `ensureRegistered()` twice on the same path returns the same ID. Calling `list()` returns all previously registered projects, even across restarts.

---

### Step 8: Event Observer (Auto-Discovery)

**File:** `packages/devbuddy/src/observer/session-observer.ts`

Subscribes to OpenCode's `SessionEvent.PromptLifecycle.Admitted` events. When a prompt is admitted for a session in a known project directory, calls `DevBuddyProjects.ensureRegistered()` to lazily register the project.

```ts
export function observe(): Effect.Effect<void>
```

Implementation:
1. `yield* EventV2.Service` to get the events interface
2. Call `events.listen(listener)` wrapped in `Effect.acquireRelease` for scoped lifecycle
3. In the listener: filter for `"SessionEvent.PromptLifecycle.Admitted"` type, extract `event.location.directory`, call `DevBuddyProjects.ensureRegistered(directory)`
4. Ignore events without a recognized project directory

This file depends on `EventV2.Service`, `DevBuddyProjects.Service`, and is consumed by the layer.

**Directory:** `packages/devbuddy/src/observer/` (create)

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/observer/` (directory) |
| Create | `packages/devbuddy/src/observer/session-observer.ts` |

**Dependencies:** Step 7 (registry.ts for ensureRegistered), `@opencode-ai/core/event` for `EventV2`

**Completion:** When a session prompt is admitted, the project's worktree directory is implicitly registered in the `dev_intel_project` table. No registration occurs for events outside known project directories.

---

### Step 9: TUI Plugin

#### 9a. Plugin Bootstrap

**File:** `packages/devbuddy/src/tui/plugin.tsx`

Registers Dev-Buddy's TUI slot handlers. Uses `@opencode-ai/plugin/tui` types.

```ts
export const plugin: TuiPluginModule = {
  id: "internal:devbuddy",
  tui: DevBuddyTuiPlugin,
}
```

The plugin function registers:

| Slot | Mode | Renders |
|------|------|---------|
| `sidebar_content` | `append` | Project list component |

Registration:

```ts
api.slots.register({
  name: "sidebar_content",
  mode: "append",
  render(props) {
    return <ProjectList api={api} />
  },
})
```

#### 9b. Project List Component

**File:** `packages/devbuddy/src/tui/project-list.tsx`

Solid JSX component that:
- Shows a "Projects" header
- Lists each registered project's name

```tsx
export function ProjectList(props: { api: TuiPluginApi }) {
  // Reads projects from DevBuddyProjects.Service
  // Renders project names
}
```

The component needs access to `DevBuddyProjects.Service`. It calls `DevBuddyProjects.list()` and renders the results.

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/tui/plugin.tsx` |
| Create | `packages/devbuddy/src/tui/project-list.tsx` |

**Dependencies:** Step 7 (registry.ts for list()), `@opencode-ai/plugin/tui` for types, `@opentui/solid` for JSX

**Completion:** TUI sidebar shows "Projects" section with names of registered projects. Projects appear automatically after first session in that worktree.

---

### Step 10: Effect Layer (Wiring)

**File:** `packages/devbuddy/src/layer.ts`

Wires all Phase 1 services into a single Effect Layer:

```ts
export const layer = Layer.mergeAll(
  DevBuddyDb.defaultLayer,
  Layer.effect(DevBuddyProjects.Service, DevBuddyProjects.layer),
).pipe(
  Layer.provideMerge(observerLayer),
)
```

Where `observerLayer` is a `Layer.effectDiscard` that calls `DevBuddySessionObserver.observe()` with a scoped lifecycle.

This is the single exported layer that OpenCode imports.

| Action | Create |
|--------|--------|
| Create | `packages/devbuddy/src/layer.ts` |

**Dependencies:** Step 4 (db.ts), Step 7 (registry.ts), Step 8 (observer)

**Completion:** `DevBuddyLayer.layer` compiles and wires DB + Projects + observer. No layer provides circular dependencies.

---

### Step 11: OpenCode Integration

#### 11a. Register in AppRuntime

**File:** `packages/opencode/src/effect/app-runtime.ts`

Two changes:
1. Add import at top: `import { DevBuddyLayer } from "@opencode-ai/devbuddy"`
2. Add to `Layer.mergeAll` chain: `.pipe(Layer.provideMerge(DevBuddyLayer.layer))`

#### 11b. Register TUI Plugin

**File:** `packages/tui/src/feature-plugins/builtins.ts`

Two changes:
1. Add import at top: `import { plugin as DevBuddyPlugin } from "@opencode-ai/devbuddy/tui"`
2. Add `DevBuddyPlugin` to the returned array in `createBuiltinPlugins()`

| Action | Modify |
|--------|--------|
| Modify | `packages/opencode/src/effect/app-runtime.ts` |
| Modify | `packages/tui/src/feature-plugins/builtins.ts` |

**Dependencies:** Step 9 (plugin.tsx must export plugin), Step 10 (layer.ts must export layer)

**Completion:** `DevBuddyLayer.layer` is provided to the AppRuntime. `DevBuddyPlugin` is in the builtin plugins list. Dev-Buddy runs when OpenCode starts and shows project info in the sidebar.

---

## Summary: All Files

### Files to Create (14)

| # | Path | Purpose |
|---|------|---------|
| 1 | `packages/devbuddy/package.json` | Package manifest |
| 2 | `packages/devbuddy/tsconfig.json` | TypeScript config |
| 3 | `packages/devbuddy/src/index.ts` | Public API barrel |
| 4 | `packages/devbuddy/src/schema.ts` | Effect Schema for Project |
| 5 | `packages/devbuddy/src/core/types.ts` | Base types |
| 6 | `packages/devbuddy/src/core/id.ts` | ID generation |
| 7 | `packages/devbuddy/src/core/errors.ts` | Tagged errors |
| 8 | `packages/devbuddy/src/storage/schema.sql.ts` | Drizzle table definition |
| 9 | `packages/devbuddy/src/storage/migration.ts` | Migration runner |
| 10 | `packages/devbuddy/src/storage/migrations/001_project_table.ts` | Phase 1 migration |
| 11 | `packages/devbuddy/src/storage/db.ts` | Database connection + auto-migration |
| 12 | `packages/devbuddy/src/storage/project-store.ts` | Project CRUD |
| 13 | `packages/devbuddy/src/projects/scanner.ts` | Filesystem scanner |
| 14 | `packages/devbuddy/src/projects/registry.ts` | Registry service |
| 15 | `packages/devbuddy/src/observer/session-observer.ts` | EventV2 subscription for auto-discovery |
| 16 | `packages/devbuddy/src/tui/plugin.tsx` | TUI plugin bootstrap |
| 17 | `packages/devbuddy/src/tui/project-list.tsx` | Sidebar project list component |
| 18 | `packages/devbuddy/src/layer.ts` | Effect Layer wiring |

### Files to Modify (2)

| # | Path | Change |
|---|------|--------|
| 1 | `packages/opencode/src/effect/app-runtime.ts` | Add import + `Layer.provideMerge(DevBuddyLayer.layer)` |
| 2 | `packages/tui/src/feature-plugins/builtins.ts` | Add import + `DevBuddyPlugin` to plugin array |

## Summary: Dependency Graph

```
Step 0 (Workspace)
  └── Step 1 (Package Foundation)
        ├── Step 2 (Schema) ──┐
        ├── Step 3 (Migration) ─┼── Step 4 (DB Connection)
        └── Step 6 (Scanner) ──┤
                               ├── Step 5 (Project Store)
                               │     └── Step 7 (Registry)
                               │           ├── Step 8 (Observer)
                               │           └── Step 9 (TUI Plugin)
                               │                 └── Step 10 (Layer)
                               │                       └── Step 11 (OpenCode Integration)
```

Steps within a dependency level can be done in parallel:
- Steps 2, 3, 6 are independent of each other (Step 2 → Step 5, Step 3 → Step 4, Step 6 → Step 7)
- Steps 8, 9 are independent after Step 7
