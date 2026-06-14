# OpenCode System Map

## Major Subsystems

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCODE ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│  CLI Layer (packages/opencode/src/cli/)                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  yargs CLI → effect-cmd.ts → AppRuntime.runPromise()   │ │
│  │  Commands: tui, run, serve, mcp, session, debug, etc.  │ │
│  └──────────────────────┬──────────────────────────────────┘ │
│                         │                                    │
│                         ▼                                    │
│  Session Layer (packages/opencode/src/session/ + core/)      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  V1 (legacy): SessionPrompt → SessionProcessor → LLM    │ │
│  │  V2 (future): SessionV2 → SessionRunner → LLM (native) │ │
│  └──────────────────────┬──────────────────────────────────┘ │
│                         │                                    │
│              ┌──────────┼──────────┐                         │
│              ▼          ▼          ▼                         │
│  ┌──────────────┐ ┌──────────┐ ┌──────────┐                 │
│  │  LLM Service  │ │  Tool    │ │  MCP     │                 │
│  │  (provider    │ │ Registry │ │  Service │                 │
│  │   streaming)  │ │          │ │          │                 │
│  └──────────────┘ └──────────┘ └──────────┘                 │
│                         │                                    │
│                         ▼                                    │
│  Storage Layer (packages/core/src/database/)                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  SQLite (Drizzle ORM) ← Event Sourcing (EventV2)       │ │
│  │  + config files (JSON/JSONC)                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  UI Layer (packages/tui/ + packages/app/)                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  TUI: SolidJS + OpenTUI (terminal)                      │ │
│  │  Web: SolidJS + Vite (browser)                          │ │
│  │  Desktop: Electron (packages/desktop/)                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Runtime Architecture

### Application Runtime (DI Container)

The entire application is wired together through Effect Layers assembled in `AppRuntime`:

```
AppRuntime (packages/opencode/src/effect/app-runtime.ts)
├── AppLayer (Layer.mergeAll of 35+ services)
│   ├── Database.Service        (SQLite via Drizzle)
│   ├── Config.Service          (JSON config files)
│   ├── Auth.Service            (API key auth)
│   ├── Account.Service         (user accounts)
│   ├── Provider.Service        (LLM provider catalog)
│   ├── Agent.Service           (agent definitions)
│   ├── Session.Service         (session CRUD)
│   ├── SessionPrompt.Service   (V1 prompt orchestrator)
│   ├── SessionProcessor.Service(V1 stream processor)
│   ├── LLM.Service             (model streaming)
│   ├── MCP.Service             (MCP server lifecycle)
│   ├── ToolRegistry.Service    (V1 tool registry)
│   ├── Plugin.Service          (plugin system)
│   ├── Permission.Service      (permission evaluation)
│   ├── LSP.Service             (language server integration)
│   └── ... (20+ more services)
├── Layer.provideMerge(Ripgrep)
├── Layer.provideMerge(InstanceLayer)
└── Layer.provideMerge(Observability)
```

### Location-Scoped Services

Each project directory gets its own isolated service graph via `LocationServiceMap`:

```
Location (directory + workspace)
├── Config (merged: global < project < .opencode/)
├── ToolRegistry.Service (built-ins + custom tools)
├── InstanceState (per-directory MCP connections, watchers, etc.)
└── LocationServiceMap → per-directory service routing
```

### Two Parallel Session Systems

**V1 (Legacy, in `packages/opencode/src/session/`)**:
- Uses AI SDK (`ai` package) for tool execution
- `SessionPrompt` orchestrates the full LLM + tool loop
- `SessionProcessor` processes LLM event streams
- Tools defined via AI SDK `tool()` pattern

**V2 (Future, in `packages/core/src/session/`)**:
- Uses `@opencode-ai/llm` directly (Effect-native)
- Event-sourced: all state changes through `EventV2.publish()`
- `SessionRunner` orchestrates the durable loop
- Tools defined via `Tool.make()` pattern
- System context algebra for composable context sources

## Data Flow

```
User Input (TUI or CLI)
    │
    ▼
SDK Layer (optional if remote or process-bridge)
    │
    ▼
SessionV2.prompt({ sessionID, prompt, delivery })
    │
    ├── SessionInput.admit() → publishes Admitted event
    │       └── session_input table row created
    │
    ├── (if resume !== false) → execution.wake(sessionID)
    │       └── SessionRunCoordinator schedules drain
    │
    ▼
SessionRunner.run(sessionID)
    │
    ├── load session, select agent
    ├── SessionContextEpoch.initialize/prepare
    │   ├── load SystemContext sources (environment, date, skills, guidance)
    │   ├── reconcile or replace context
    │   └── context stored in session_context_epoch table
    ├── promote steers + queue inputs → session_message rows
    ├── load projected history → toLLMMessages()
    ├── materialize tools → tool definitions + settle()
    ├── build LLM request (system + messages + tools)
    │
    ▼
LLM.stream(request) → Stream<LLMEvent>
    │
    ├── text events → persisted via SessionEvent.Text.*
    ├── reasoning events → persisted via SessionEvent.Reasoning.*
    ├── tool-call events → persisted via SessionEvent.Tool.*
    │   └── → toolMaterialization.settle() executes tool
    │       ├── built-in tools (read, write, edit, shell, etc.)
    │       ├── custom tools (from tool/*.ts files)
    │       └── plugin tools
    │
    ├── tool results → next provider turn (up to 25 steps)
    └── no more tools → session settles
    │
    ▼
Events → SessionProjector → SQLite tables
    │
    ▼
UI update via EventV2Bridge → WebSocket → TUI/Web
```

## User Request Lifecycle

1. **User types prompt** in TUI `<Prompt>` component
2. **Prompt submitted** → SDK `session.prompt()` called
3. **Request routed** through HTTP server (internal or external) to handler
4. **Handler calls** `SessionV2.prompt()` in core
5. **Input admitted** → event-sourced, stored in `session_input` table
6. **Execution woken** → `SessionRunCoordinator.run()` called
7. **Runner** loads session, resolves agent/model, assembles context
8. **LLM.stream()** → one provider turn (exactly one API call)
9. **Events flow back** through event system → projector persists
10. **Tool calls** settled → results persisted → next turn if needed
11. **When complete** → final assistant message persisted
12. **UI updated** via event stream → user sees response

## What Lives Where

| Concern | Location |
|---------|----------|
| CLI framework | `packages/opencode/src/cli/` |
| Configuration | `packages/core/src/config.ts` + `packages/core/src/config/*.ts` |
| Session (V2) | `packages/core/src/session.ts` + `packages/core/src/session/*.ts` |
| Session (V1 legacy) | `packages/opencode/src/session/*.ts` |
| LLM integration | `packages/opencode/src/session/llm.ts` + `packages/opencode/src/session/llm/*.ts` |
| Tool definitions | `packages/opencode/src/tool/*.ts` (V1) + `packages/core/src/tool/*.ts` (V2) |
| MCP integration | `packages/opencode/src/mcp/*.ts` |
| Provider catalog | `packages/opencode/src/provider/*.ts` + `packages/core/src/plugin/provider/*.ts` |
| Storage | `packages/core/src/database/*.ts` + `packages/core/src/**/*.sql.ts` |
| Event sourcing | `packages/core/src/event.ts` + `packages/core/src/event/sql.ts` |
| System context | `packages/core/src/system-context/*.ts` |
| Plugin system | `packages/opencode/src/plugin/*.ts` + `packages/plugin/` |
| HTTP server | `packages/opencode/src/server/*.ts` |
| TUI | `packages/tui/src/` |
| Web app | `packages/app/src/` |
| LLM protocol layer | `packages/llm/` |
| SDK (JS) | `packages/sdk/js/` |
