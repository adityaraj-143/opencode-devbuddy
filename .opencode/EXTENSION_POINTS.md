# Extension Points for Dev-Intel Integration

## CRITICAL FILE — This identifies safe integration locations for Dev-Intel.

---

## 1. Session Start Hooks

### Where to detect "project open" and "session start"

#### Project Open Detection

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `InstanceState.make()` | `packages/opencode/src/effect/instance-state.ts` | Called when a project directory is opened. Scoped to directory lifecycle. | **SAFE** — Scoped lifecycle, automatic cleanup |
| `InstanceStore.load()` | `packages/opencode/src/project/instance-store.ts` | Loads/creates instance for a directory. Called on project open. | **SAFE** |
| `Project.bootstrap()` | `packages/opencode/src/project/bootstrap.ts` | Bootstraps all services for a project. | **SAFE** — Wraps init() in forkDetach |
| `Location.Service` | `packages/core/src/location.ts` | Location resolution on startup. | **SAFE** |

#### Session Start Detection

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `SessionV2.create()` | `packages/core/src/session.ts` | Session creation event published | **SAFE** — Event-driven hook |
| `SessionV2.prompt()` | `packages/core/src/session.ts` | Entry point before Input.admit() | **SAFE** |
| `SessionInput.admit()` | `packages/core/src/session/input.ts` | Just before event publication | **SAFE** |
| `SessionRunCoordinator.run()` | `packages/core/src/session/run-coordinator.ts` | Start of execution lane | **SAFE** |
| `SessionRunner.run()` | `packages/core/src/session/runner/llm.ts` | Start of actual LLM orchestration | **SAFE** |

### Recommended Hook Pattern

```ts
// Hook into session creation via EventV2 event subscription
events.subscribe(SessionEvent.*, (event) => {
  // Dev-Intel: detect session start, load project memory
})
```

or via `EventV2.beforeCommit()`:

```ts
events.beforeCommit("dev-intel/session-start", (event) => {
  // Dev-Intel: run before session event is committed to DB
})
```

---

## 2. Prompt Injection Hooks

### Where to inject context BEFORE model calls

#### V2 Path (Future, Preferred)

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `SystemContextRegistry.register()` | `packages/core/src/system-context/registry.ts` | **BEST HOOK** — Register a `SystemContext.Source` that injects project/developer memory as a system context source | **SAFE** — Designed for this |
| `SystemContext.combine()` | `packages/core/src/system-context/index.ts` | Context combination point | **SAFE** |
| `SystemContext.builtins` | `packages/core/src/system-context/builtins.ts` | Add Dev-Intel built-in sources here | **SAFE** |
| `SessionContextEpoch.initialize()` | `packages/core/src/session/context-epoch.ts` | Context baseline creation | **SAFE** |
| `SessionContextEpoch.prepare()` | `packages/core/src/session/context-epoch.ts` | Context reconciliation/preparation | **SAFE** |

**Recommended: Register a SystemContext.Source**

```ts
// In Dev-Intel plugin, at Layer setup:
systemContext.register(
  SystemContext.Source({
    key: "dev-intel/project-memory",
    codec: Schema.String,
    load: () => DevIntel.loadProjectMemory(),
    baseline: (ctx) => `## Project Memory\n\n${ctx}`,
    update: (prev, curr) => diffBaseline(prev, curr),
  })
)
```

The runner in `runner/llm.ts` loads system context via:
```ts
const system = yield* SessionContextEpoch.initialize(db, loadSystemContext(agent), ...)
```

...where `loadSystemContext` includes your registered source automatically via `systemContext.load()`.

#### V1 Path (Legacy, Active)

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `SystemPrompt` construction | `packages/opencode/src/session/system.ts` | System prompt assembly | **MODERATE** — May conflict with agent prompts |
| `SessionPrompt.prompt()` loop setup | `packages/opencode/src/session/prompt.ts` | Before LLM call, session tools resolution | **MODERATE** — Side effects possible |
| Plugin hooks: `plugin.trigger("systemPrompt", ...)` | `packages/opencode/src/plugin/` | Plugin system prompt hook | **SAFE** — Designed for extension |

---

## 3. Tool Execution Hooks

### Where to observe tool start and tool finish

#### V2 Path (Future, Preferred)

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `ToolRegistry.materialize()` | `packages/core/src/tool/registry.ts` | Tool definition materialization — wrap with enriched tool | **SAFE** |
| `toolMaterialization.settle()` | `packages/core/src/tool/registry.ts` | Tool execution dispatch — observe before/after | **SAFE** |
| `Tool.make()` execute function | `packages/core/src/tool/tool.ts` | Tool execution function — wrap with instrumentation | **SAFE** |
| Tool events published to EventV2 | `packages/core/src/session/event.ts` (`Tool.Called`, `Tool.Success`, `Tool.Failed`) | Observe via EventV2 subscription | **SAFE** |

**Recommended: Subscribe to tool events**

```ts
events.subscribe(SessionEvent.Tool.Called, (event) => {
  DevIntel.onToolStart(event.sessionID, event.callID, event.name)
})
events.subscribe(SessionEvent.Tool.Success, (event) => {
  DevIntel.onToolFinish(event.sessionID, event.callID)
})
events.subscribe(SessionEvent.Tool.Failed, (event) => {
  DevIntel.onToolError(event.sessionID, event.callID, event.error)
})
```

Or via `Tool.make()` wrapper:
```ts
const DevIntelTool = Tool.make({
  ...originalTool,
  execute: (input, ctx) => {
    DevIntel.notifyToolStart(originalTool.id, input)
    return originalTool.execute(input, ctx).pipe(
      Effect.tapBoth({
        onSuccess: (result) => DevIntel.notifyToolSuccess(originalTool.id, result),
        onFailure: (error) => DevIntel.notifyToolError(originalTool.id, error),
      })
    )
  }
})
```

#### V1 Path (Legacy, Active)

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `Plugin hooks`: `tool.execute.before` / `tool.execute.after` | `packages/opencode/src/plugin/` | Plugin tool execution hooks | **SAFE** — Designed for this |
| `ToolRegistry.all()` | `packages/opencode/src/tool/registry.ts` | Tool enumeration | **SAFE** |
| `EventV2Bridge` | `packages/opencode/src/event-v2-bridge.ts` | Event bridge to plugin system | **SAFE** |

---

## 4. Storage Hooks

### Where Dev-Intel can persist information

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `EventV2.publish()` | `packages/core/src/event.ts` | Publish Dev-Intel events into the event log | **SAFE** — Event sourcing is append-only |
| `Database.Service` | `packages/core/src/database/database.ts` | Direct SQLite access via Drizzle | **SAFE** — Use existing tables or create new ones |
| `SessionStore` | `packages/core/src/session/store.ts` | Read session data | **SAFE** — Read-only |
| New Drizzle tables | `packages/core/src/**/*.sql.ts` | Create new tables for Dev-Intel data (project memory, developer context, etc.) | **SAFE** — Follow existing pattern |
| `Config.Service` | `packages/core/src/config.ts` | Config storage for Dev-Intel settings | **SAFE** |
| KV store (TUI) | `packages/tui/src/context/kv.tsx` | UI-level key-value persistence (JSON-backed) | **SAFE** — UI only |

**Recommended storage approach:**

```ts
// New table: dev_intel_memory (in its own .sql.ts file)
export const DevIntelMemoryTable = sqliteTable("dev_intel_memory", {
  id: text().primaryKey(),
  project_id: text().notNull().references(() => ProjectTable.id),
  type: text().notNull(), // "project" | "session" | "developer" | "learned"
  content: text().notNull(), // JSON: structured memory
  confidence: real().notNull().default(1.0),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
  last_accessed: integer().notNull(),
})
```

---

## 5. UI Hooks

### Where Dev-Intel can expose UI elements

#### TUI Plugin Slot System

| Slot | File | Description | Safety |
|------|------|-------------|--------|
| `sidebar_content` | `packages/tui/src/routes/session/sidebar.tsx:85` | Add panels to session sidebar | **SAFE** — Designed for plugins |
| `sidebar_title` | `packages/tui/src/routes/session/sidebar.tsx:49` | Customize title area | **SAFE** |
| `sidebar_footer` | `packages/tui/src/routes/session/sidebar.tsx:90` | Add footer content | **SAFE** |
| `home_prompt` | `packages/tui/src/routes/home.tsx:82` | Customize home prompt area | **SAFE** |
| `home_bottom` | `packages/tui/src/routes/home.tsx:86` | Add content below home prompt | **SAFE** |
| `home_footer` | `packages/tui/src/routes/home.tsx:91` | Home footer customization | **SAFE** |
| `session_prompt` | `packages/tui/src/routes/session/index.tsx:~1300` | Replace/augment prompt | **SAFE** |
| `session_prompt_right` | `packages/tui/src/routes/session/index.tsx:~1317` | Right of prompt | **SAFE** |
| `app_bottom` | `packages/tui/src/app.tsx:~1092` | Application-wide bottom bar | **SAFE** |

**Reference implementations for TUI plugins:**

| Plugin | File | What It Does |
|--------|------|-------------|
| Context panel | `packages/tui/src/feature-plugins/sidebar/context.tsx` | Shows token count, context %, cost |
| Files panel | `packages/tui/src/feature-plugins/sidebar/files.tsx` | Shows modified files |
| MCP panel | `packages/tui/src/feature-plugins/sidebar/mcp.tsx` | Shows MCP connection status |
| Todo panel | `packages/tui/src/feature-plugins/sidebar/todo.tsx` | Shows todo items |
| Tips panel | `packages/tui/src/feature-plugins/home/tips.tsx` | Shows tips on home screen |

**Recommended: Create a Dev-Intel sidebar plugin**

```ts
// Following patterns in feature-plugins/sidebar/context.tsx
class DevIntelSidebarPlugin implements BuiltinTuiPlugin {
  id = "dev-intel-memory-sidebar"
  setup(api: TuiPluginApi) {
    api.slots.register("sidebar_content", () => <DevIntelMemoryPanel />)
  }
}
```

Register in `packages/tui/src/feature-plugins/builtins.ts`.

#### Web App

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| Session context tab | `packages/app/src/components/session/session-context-tab.tsx` | Context breakdown (extend with Dev-Intel info) | **MODERATE** — UI change in app |
| Side panel | `packages/app/src/pages/session/session-side-panel.tsx` | Session side panel (extend or add sections) | **MODERATE** |

---

## 6. Event System Hooks

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `EventV2.subscribe()` | `packages/core/src/event.ts` | Subscribe to any event type | **SAFE** |
| `EventV2.beforeCommit()` | `packages/core/src/event.ts` | Run code before event commit (as part of transaction) | **MODERATE** — Runs in transaction; must not fail |
| `EventV2.project()` | `packages/core/src/event.ts` | Register a projector for Dev-Intel events | **SAFE** |
| `EventV2.listen()` | `packages/core/src/event.ts` | Listen for committed events (async, non-blocking) | **SAFE** |

---

## 7. Service Layer Hooks

| Point | File | Description | Safety |
|-------|------|-------------|--------|
| `AppRuntime` layers | `packages/opencode/src/effect/app-runtime.ts` | Add Dev-Intel service Layer | **SAFE** — Layer.mergeAll pattern |
| `Plugin.Service` | `packages/opencode/src/plugin/` | Plugin system hooks | **SAFE** |
| `Global.defaultLayer` | `packages/tui/src/app.tsx` | TUI layer where Dev-Intel can be provided | **SAFE** |

---

## 8. What Parts to Avoid / Touch With Care

| Area | Why Avoid |
|------|-----------|
| `packages/opencode/src/session/prompt.ts` (V1) | 1722 lines of legacy orchestration; being replaced by V2 runner |
| `packages/opencode/src/session/processor.ts` (V1) | 1084 lines, tightly coupled to AI SDK; replacement in progress |
| `packages/core/src/session/runner/llm.ts` | The critical V2 runner; stable but minimal. Add to system context, don't modify runner. |
| `packages/opencode/src/effect/app-runtime.ts` | DI container — only add new layers, never modify existing ones |
| `packages/core/src/event.ts` | Core infrastructure — use its APIs, don't modify internals |
| `packages/core/src/config.ts` | Core config — only extend the schema, don't change loading |
| `packages/core/src/database/migration.ts` | Migration infrastructure — add migrations, don't change the system |
| `packages/core/src/database/schema.gen.ts` | Auto-generated — don't edit manually |
| `packages/core/src/database/migration.gen.ts` | Auto-generated — don't edit manually |

---

## 9. Safe Integration Summary (Recommended)

| Integration | Method | Safety | Effort |
|-------------|--------|--------|--------|
| Project memory injection | `SystemContextRegistry.register()` source | SAFE | Low |
| Session start detection | `EventV2.subscribe(SessionEvent.*)` | SAFE | Low |
| Tool execution observation | `EventV2.subscribe(Tool.* events)` | SAFE | Low |
| Dev-Intel persistence | New Drizzle table in `packages/core/src/**/*.sql.ts` | SAFE | Medium |
| UI sidebar panel | TUI plugin slot `sidebar_content` | SAFE | Medium |
| Home page briefing | TUI plugin slot `home_bottom` or `home_footer` | SAFE | Medium |
| Developer memory | New `SystemContext.Source` registered at startup | SAFE | Low |
| Session memory | New `SystemContext.Source` with session-scoped loading | SAFE | Medium |
