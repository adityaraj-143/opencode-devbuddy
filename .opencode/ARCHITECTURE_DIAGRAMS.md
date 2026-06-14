# Architecture Diagrams

## 1. Request Lifecycle (V2 Future Path)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        REQUEST LIFECYCLE                             │
└──────────────────────────────────────────────────────────────────────┘

User                    OpenCode                  Core                    LLM Provider
 │                         │                        │                        │
 │  Type/Submit prompt     │                        │                        │
 │────────────────────────>│                        │                        │
 │                         │                        │                        │
 │                    ┌────┴────┐                   │                        │
 │                    │ TUI/Web │                   │                        │
 │                    │  Input  │                   │                        │
 │                    │ Handler │                   │                        │
 │                    └────┬────┘                   │                        │
 │                         │                        │                        │
 │                    ┌────┴────┐                   │                        │
 │                    │ Session │                   │                        │
 │                    │  SDK    │                   │                        │
 │                    │  call   │                   │                        │
 │                    └────┬────┘                   │                        │
 │                         │                        │                        │
 │                         │  session.prompt()      │                        │
 │                         │───────────────────────>│                        │
 │                         │                        │                        │
 │                         │                   ┌────┴────┐                  │
 │                         │                   │Input    │                  │
 │                         │                   │Admit    │                  │
 │                         │                   │publish  │                  │
 │                         │                   │event    │                  │
 │                         │                   └────┬────┘                  │
 │                         │                        │                        │
 │                         │                   ┌────┴────┐                  │
 │                         │                   │Session  │                  │
 │                         │                   │RunCoord │                  │
 │                         │                   │ .run()  │                  │
 │                         │                   └────┬────┘                  │
 │                         │                        │                        │
 │                         │                   ┌────┴────┐                  │
 │                         │                   │Session  │                  │
 │                         │                   │Runner   │                  │
 │                         │                   │ .run()  │                  │
 │                         │                   └────┬────┘                  │
 │                         │                        │                        │
 │                         │              ┌─────────┼──────────┐            │
 │                         │              │         │          │            │
 │                         │         ┌────┴──┐ ┌───┴────┐ ┌───┴────┐      │
 │                         │         │System │ │History │ │Tool    │      │
 │                         │         │Context│ │ + Msgs │ │Mat'z-  │      │
 │                         │         │       │ │        │ │ation   │      │
 │                         │         └────┬──┘ └───┬────┘ └───┬────┘      │
 │                         │              └────┬────┘         │            │
 │                         │                   │              │            │
 │                         │              ┌────┴──────────────┘            │
 │                         │              │ LLM.request()                  │
 │                         │              │ system + messages + tools     │
 │                         │              └────┬────┘                      │
 │                         │                   │                           │
 │                         │                   │  llm.stream(request)      │
 │                         │                   │──────────────────────────>│
 │                         │                   │                           │
 │                         │                   │  ┌──────────────────┐    │
 │                         │                   │  │ Stream<LLMEvent> │    │
 │                         │                   │  │ · text deltas    │    │
 │                         │                   │  │ · reasoning      │    │
 │                         │                   │  │ · tool calls     │    │
 │                         │                   │  │ · errors         │    │
 │                         │                   │  └──────────────────┘    │
 │                         │                   │                           │
 │                         │              ┌────┴────┐                      │
 │                         │              │Settle   │                      │
 │                         │              │Tool     │                      │
 │                         │              │Calls    │                      │
 │                         │              └────┬────┘                      │
 │                         │                   │                           │
 │                         │              ┌────┴────┐                      │
 │                         │              │Project  │                      │
 │                         │              │Events→DB│                      │
 │                         │              └────┬────┘                      │
 │                         │                        │                        │
 │                         │  Event stream          │                        │
 │                         │<───────────────────────│                        │
 │                         │                        │                        │
 │   Render response       │                        │                        │
 │<────────────────────────│                        │                        │
 │                         │                        │                        │
```

## 2. Tool Execution Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                       TOOL EXECUTION LIFECYCLE                        │
└──────────────────────────────────────────────────────────────────────┘

V2 Path:
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐
│ LLM      │    │ ToolRegistry │    │ Tool         │    │ Tool      │
│ Stream   │    │ .settle()    │    │ .execute()   │    │ Output    │
│          │    │              │    │              │    │ Store     │
└────┬─────┘    └──────┬───────┘    └──────┬───────┘    └─────┬─────┘
     │                  │                  │                  │
     │ tool-call event  │                  │                  │
     │─────────────────>│                  │                  │
     │                  │                  │                  │
     │            ┌─────┴──────┐           │                  │
     │            │ Look up by │           │                  │
     │            │ name       │           │                  │
     │            │ Decode     │           │                  │
     │            │ input via  │           │                  │
     │            │ schema     │           │                  │
     │            └─────┬──────┘           │                  │
     │                  │                  │                  │
     │                  │ execute(input)   │                  │
     │                  │────────────────>│                  │
     │                  │                  │                  │
     │                  │            ┌─────┴─────┐            │
     │                  │            │ Filesystem │            │
     │                  │            │ Shell      │            │
     │                  │            │ Web        │            │
     │                  │            │ etc.       │            │
     │                  │            └─────┬─────┘            │
     │                  │                  │                  │
     │                  │                  │ Encode output    │
     │                  │                  │ via schema       │
     │                  │                  ──────────────────>│
     │                  │                  │                  │
     │                  │                  │ Bound output     │
     │                  │                  │<─────────────────│
     │                  │<─────────────────│                  │
     │                  │                  │                  │
     │            ┌─────┴──────┐           │                  │
     │            │ Publish    │           │                  │
     │            │ Success /  │           │                  │
     │            │ Failed     │           │                  │
     │            │ event      │           │                  │
     │            └────────────┘           │                  │
     │                  │                  │                  │
     │<─────────────────│                  │                  │
     │                  │                  │                  │
     │ Continue to next │                  │                  │
     │ provider turn    │                  │                  │
     │ (if tool results)│                  │                  │
     │                  │                  │                  │

Tool types:
┌──────────────────────────────────────────────────────────────────┐
│  Built-in:   read │ write │ edit │ shell │ glob │ grep          │
│              task │ question │ webfetch │ websearch              │
│              apply_patch │ plan │ skill │ todo │ lsp            │
├──────────────────────────────────────────────────────────────────┤
│  Custom:     tool/*.{js,ts} in project directory                 │
├──────────────────────────────────────────────────────────────────┤
│  Plugin:     @opencode-ai/plugin tool definitions                 │
├──────────────────────────────────────────────────────────────────┤
│  MCP:        Remote/local tools via Model Context Protocol        │
└──────────────────────────────────────────────────────────────────┘
```

## 3. MCP Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MCP ARCHITECTURE                              │
└──────────────────────────────────────────────────────────────────────┘

                                  ┌──────────────────────┐
                                  │   opencode.json      │
                                  │   mcp.servers.{...}  │
                                  └──────────┬───────────┘
                                             │
                                             ▼
                                    ┌────────────────┐
                                    │  Config.Service │
                                    │  resolve config │
                                    └───────┬────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
         ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
         │  MCP.Service      │  │  MCP.Service      │  │  MCP.Service      │
         │  .create("svr1")  │  │  .create("svr2")  │  │  .create("svr3")  │
         └────────┬──────────┘  └────────┬──────────┘  └────────┬──────────┘
                  │                      │                      │
        ┌─────────┴─────────┐   ┌────────┴────────┐   ┌────────┴────────┐
        │ StdioClient       │   │ StreamableHTTP  │   │ SSEClient       │
        │ Transport         │   │ ClientTransport │   │ Transport       │
        │ (local child      │   │ (remote,        │   │ (remote,        │
        │  process)         │   │  preferred)     │   │  fallback)      │
        └─────────┬─────────┘   └────────┬────────┘   └────────┬────────┘
                  │                      │                      │
                  ▼                      ▼                      ▼
        ┌──────────────────────────────────────────────────────────┐
        │              @modelcontextprotocol/sdk Client            │
        │  JSON-RPC over transport                                 │
        │  Capabilities: tools / prompts / resources               │
        └──────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │              McpCatalog (catalog.ts)                     │
        │  · defs(client) → list tools with pagination             │
        │  · convertTool(mcpTool) → AI SDK dynamicTool()           │
        │  · prompts(client) → list prompts                        │
        │  · resources(client) → list resources                    │
        └──────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │              Tool Consumption Points                      │
        ├──────────────────────────────────────────────────────────┤
        │  V1: SessionTools.resolve() → SessionPrompt.prompt()     │
        │  V2: ToolRegistry.materialize() → SessionRunner.run()    │
        └──────────────────────────────────────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │              MCP Tool Execution                          │
        │  V1: AI SDK dynamicTool.execute → client.callTool()      │
        │  V2: Tool.settle → (not yet ported, MCP in V2 pending)  │
        └──────────────────────────────────────────────────────────┘

OAuth Flow (for remote MCP):
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ User     │    │ opencode     │    │ MCP Server   │    │ Browser      │
│ (CLI)    │    │              │    │              │    │              │
└────┬─────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
     │                  │                  │                  │
     │ mcp auth svr     │                  │                  │
     │─────────────────>│  Start OAuth      │                  │
     │                  │─────────────────>│                  │
     │                  │ Authorization URL │                 │
     │                  │<─────────────────│                  │
     │                  │                  │                  │
     │                  │ Open browser     │                  │
     │                  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>  │
     │                  │                  │                  │
     │                  │                  │ Auth code        │
     │                  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
     │                  │                  │                  │
     │                  │ Exchange code    │                  │
     │                  │─────────────────>│                  │
     │                  │ Tokens           │                  │
     │                  │<─────────────────│                  │
     │                  │                  │                  │
     │                  │ Store tokens in  │                  │
     │                  │ mcp-auth.json    │                  │
     │                  │                  │                  │
```

## 4. Storage Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         STORAGE ARCHITECTURE                          │
└──────────────────────────────────────────────────────────────────────┘

File System                              SQLite Database
┌─────────────────────┐    ┌───────────────────────────────────────────┐
│  ~/.config/opencode/│    │  ~/.local/share/opencode/opencode.db      │
│  ├── opencode.json  │    │                                           │
│  ├── opencode.jsonc │    │  ┌─────────────────────────────────────┐  │
│  └── config.json    │    │  │ Event Tables (event sourcing)       │  │
│                      │    │  │  event                             │  │
│  ~/.local/share/     │    │  │  event_sequence                    │  │
│  opencode/           │    │  └─────────────────────────────────────┘  │
│  ├── opencode.db     │    │                                           │
│  ├── log/            │    │  ┌─────────────────────────────────────┐  │
│  ├── repos/          │    │  │ Core Tables                        │  │
│  ├── storage/        │    │  │  session                           │  │
│  │   └── {domain}/   │    │  │  session_message                   │  │
│  │       └── {k}.json│    │  │  session_input                     │  │
│  └── mcp-auth.json   │    │  │  session_context_epoch             │  │
│                      │    │  └─────────────────────────────────────┘  │
│  ~/.local/state/     │    │                                           │
│  opencode/           │    │  ┌─────────────────────────────────────┐  │
│                      │    │  │ V1 Legacy Tables                   │  │
│  Project Directories │    │  │  message (JSON blob)               │  │
│  ├── opencode.json   │    │  │  part (JSON blob)                  │  │
│  ├── opencode.jsonc  │    │  └─────────────────────────────────────┘  │
│  └── .opencode/      │    │                                           │
│       ├── config     │    │  ┌─────────────────────────────────────┐  │
│       └── ...        │    │  │ Supporting Tables                   │  │
│                      │    │  │  project | workspace               │  │
│                      │    │  │  account | credential               │  │
│                      │    │  │  permission | todo                  │  │
│                      │    │  │  session_share | integration        │  │
│                      │    │  │  data_migration                    │  │
│                      │    │  └─────────────────────────────────────┘  │
│                      │    │                                           │
│  Write Path:         │    │  Read Path:                               │
│  EventV2.publish()   │    │  Drizzle SELECT queries                   │
│    → event table     │    │  → SessionStore / SessionHistory          │
│    → projectors      │    │  → typed domain objects                   │
│    → domain tables   │    │                                           │
│                      │    │  Schema: Drizzle + SQLite + WAL mode      │
│                      │    │  Migrations: 37 TS files in database/     │
│                      │    │                                           │
└─────────────────────┘    └───────────────────────────────────────────┘
```

## 5. Proposed Dev-Intel Integration Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DEV-INTEL ON OPENCODE                              │
└──────────────────────────────────────────────────────────────────────┘

System Context Sources (injected before each LLM turn)
┌───────────────────────────────────────────────────────────────────┐
│  core/environment (built-in)                                      │
│  core/date (built-in)                                             │
│  dev-intel/project-memory  ◄─── NEW: Loaded from DB               │
│  dev-intel/developer-profile ◄─── NEW: User's dev preferences     │
│  dev-intel/session-memory   ◄─── NEW: Current session learnings   │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
               Injected into LLM.request() system prompt
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Dev-Intel Storage Schema                        │
│  (new Drizzle tables in packages/core/src/**/*.sql.ts)            │
├───────────────────────────────────────────────────────────────────┤
│  dev_intel_memory                                                 │
│  ├── id (PK)                                                      │
│  ├── project_id (FK → project)                                    │
│  ├── type: "project" | "session" | "developer" | "learned"       │
│  ├── content (JSON: structured memory)                            │
│  ├── confidence (float 0-1)                                       │
│  ├── time_created / time_updated / last_accessed                  │
│  └── source: "analysis" | "manual" | "inferred"                  │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Event Subscriptions (observe)                   │
├───────────────────────────────────────────────────────────────────┤
│  EventV2.subscribe(SessionEvent.PromptLifecycle.*)                │
│    → Detect new prompts, load relevant memory                     │
│  EventV2.subscribe(SessionEvent.Tool.*)                           │
│    → Track tool usage for learning patterns                       │
│  EventV2.subscribe(SessionEvent.Text.*)                           │
│    → Extract learnings from responses                             │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│                    TUI Plugin (UI display)                         │
├───────────────────────────────────────────────────────────────────┤
│  slot: "sidebar_content"                                          │
│    → Dev-Intel Memory Panel (shows active project memory)         │
│  slot: "home_bottom"                                              │
│    → Session Resume Briefing (shows context on return)            │
│  slot: "home_footer"                                              │
│    → Dev-Intel Status (memory count, freshness)                   │
└───────────────────────────────────────────────────────────────────┘

Integration Points (safe):
┌───────────────────────────────────────────────────────────────────┐
│  1. SystemContextRegistry.register()     ── Inject project memory  │
│  2. EventV2.subscribe()                  ── Observe all events     │
│  3. New Drizzle table                    ── Persist memory         │
│  4. TUI plugin system                    ── Display in UI          │
│  5. packages/core/src/**/*.sql.ts        ── Schema extensions      │
└───────────────────────────────────────────────────────────────────┘
```
