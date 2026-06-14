# OpenCode Codebase Map

## Critical Path Files

### Entry Points

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/opencode/bin/opencode` | Spawns platform-specific binary (Node.js script) | None (standalone) | First code executed; detects OS/arch, finds binary, forwards signals |
| `packages/opencode/src/index.ts` | Yargs CLI setup with all 20+ commands | yargs, all cmd modules | Single file defining every CLI command |
| `packages/opencode/src/effect/app-runtime.ts` | `ManagedRuntime` wired with all 35+ service layers | Every service module | Central DI container; every effect runs through this |
| `packages/opencode/src/cli/effect-cmd.ts` | Wraps yargs commands with Effect runtime | AppRuntime, yargs | Bridge between yargs CLI and Effect world |
| `packages/core/src/public/index.ts` | Core public API exports | Agent, Model, OpenCode, Session, Tool, Location, Prompt | Canonical public interface consumers import |

### Session System (V2 — Future)

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/session.ts` | V2 Session service: create, get, list, remove, prompt, resume, interrupt | EventV2, SessionStore, SessionInput, SessionExecution, AgentV2 | Top-level session API; all session operations flow through here |
| `packages/core/src/session/sql.ts` | Drizzle table definitions: session, session_message, session_input, session_context_epoch | Drizzle ORM | Schema that persists all session data |
| `packages/core/src/session/schema.ts` | Session ID, Info, model ref schemas | Effect Schema | Type definitions shared across the V2 session system |
| `packages/core/src/session/store.ts` | Read-only session data access from DB | Database, session/sql | Data access for sessions, messages, context |
| `packages/core/src/session/input.ts` | Prompt admission/promotion lifecycle (steer vs queue) | EventV2, session/sql | Core abstraction for prompt lifecycle: Admitted → Promoted |
| `packages/core/src/session/event.ts` | All V2 session event definitions | Effect Schema | Defines every event type (Step, Text, Tool, Reasoning, Compaction, etc.) |
| `packages/core/src/session/projector.ts` | Projects events into session_message, session_input, other tables | EventV2, all session modules, session/sql | The event → data projection pipeline; all persistence flows through here |
| `packages/core/src/session/history.ts` | Loads projected message history for the runner | Database, session/sql, session/message | Translates DB rows into LLM-ready message arrays |
| `packages/core/src/session/context-epoch.ts` | Durable system context baseline management | Database, SystemContext | Manages context versioning, reconciliation, replacement; optimistic concurrency via revision |
| `packages/core/src/session/compaction.ts` | Session compaction/summarization | LLM, EventV2, Database | Handles context overflow by summarizing conversation |
| `packages/core/src/session/run-coordinator.ts` | Process-local per-session execution lanes | Effect | Coordinates drain chains: run/wake/interrupt state machine |
| `packages/core/src/session/execution.ts` | Abstract execution interface (resume/wake/interrupt) | Effect | Trait that the coordinator implements |
| `packages/core/src/session/execution/local.ts` | Local Execution implementation | RunCoordinator, LocationServiceMap | Actual orchestration of session runner activation |
| `packages/core/src/session/message.ts` | All message types (User, Assistant, Shell, System, Compaction) | Effect Schema | The message data model for V2 |
| `packages/core/src/session/message-id.ts` | Branded message ID type | Effect Schema | IDs for session messages |

### Session Runner (V2 — The Orchestrator)

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/session/runner/index.ts` | Runner interface + Error types | Effect, LLMError | Service contract: `run({sessionID, force?})` |
| `packages/core/src/session/runner/llm.ts` | Runner implementation: 404 lines of orchestration | Everything (LLM, AgentV2, Config, EventV2, ToolRegistry, etc.) | **The heart of V2** — loads session, resolves agent/model, builds request, streams LLM, settles tools, loops up to 25 steps |
| `packages/core/src/session/runner/model.ts` | Model resolution service | Catalog, ModelV2, ProviderV2 | Resolves a session's model to @opencode-ai/llm Model |
| `packages/core/src/session/runner/to-llm-message.ts` | Translates V2 messages to @opencode-ai/llm Messages | SessionMessage | Bridge between session data model and LLM wire format |
| `packages/core/src/session/runner/publish-llm-event.ts` | Publishes LLMEvent → SessionEvent | EventV2, SessionEvent | Converts raw LLM events to durable session events |

### Session System (V1 — Legacy)

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/opencode/src/session/prompt.ts` | V1 prompt orchestrator (1722 lines) | Everything: AI SDK, MCP, Plugin, Session, ToolRegistry, LLM, etc. | **The big loop** — the original LLM + tool loop V1; still the active path for most CLI/TUI usage |
| `packages/opencode/src/session/processor.ts` | V1 LLM stream processor (1084 lines) | AI SDK, Session, Snapshot, etc. | Processes LLM event streams, manages tool calls, compaction, error recovery |
| `packages/opencode/src/session/llm.ts` | LLM Service (provider streaming) | AI SDK, @opencode-ai/llm, Provider | Creates streams from AI SDK providers or native runtime |
| `packages/opencode/src/session/session.ts` | V1 Session CRUD | Database, EventV2Bridge, Session schema | Session create/get/list/update/remove operations |
| `packages/opencode/src/session/message-v2.ts` | Message/Part persistence | Database, SessionV1 schema | Reads/writes messages to MessageTable/PartTable |
| `packages/opencode/src/session/tools.ts` | V1 tool resolution for sessions | ToolRegistry, MCP, Truncate | Gathers all tools (built-in, custom, MCP, plugin) for each LLM call |
| `packages/opencode/src/session/system.ts` | System prompt construction | Prompt templates (txt files) | Builds system prompts from template files in `prompt/` |
| `packages/opencode/src/session/schema.ts` | SessionID, MessageID, PartID (ULID branded types) | Effect Schema | ID types shared across V1 session system |

### MCP Infrastructure

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/opencode/src/mcp/index.ts` | MCP Service (928 lines) | @modelcontextprotocol/sdk, InstanceState, Config | Core MCP: server lifecycle (connect/disconnect), OAuth, tool listing, event watching |
| `packages/opencode/src/mcp/catalog.ts` | MCP tool discovery and conversion | @modelcontextprotocol/sdk, AI SDK | Lists tools from MCP servers, converts to AI SDK dynamicTool format |
| `packages/opencode/src/mcp/auth.ts` | OAuth token storage | File system, JSON | Persists MCP OAuth tokens per directory |
| `packages/opencode/src/mcp/oauth-provider.ts` | MCP OAuth client provider | @modelcontextprotocol/sdk | Implements OAuth2 for remote MCP servers |
| `packages/opencode/src/mcp/oauth-callback.ts` | Local OAuth callback HTTP server | Effect HTTP | Receives OAuth redirect and completes auth flow |
| `packages/core/src/config/mcp.ts` | MCP config schema | Effect Schema | Defines config structure for Local/Remote MCP servers |

### Tool Systems — V1

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/opencode/src/tool/registry.ts` | V1 Tool Registry | All built-in tool modules | Central tool manager: registers 18+ built-in tools + custom + plugin tools |
| `packages/opencode/src/tool/tool.ts` | V1 tool type system | Effect, Zod | Tool.Def/Info/define/init types and helpers |
| `packages/opencode/src/tool/read.ts` | File read tool | FSUtil | One of the most-used tools |
| `packages/opencode/src/tool/write.ts` | File write tool | FSUtil | Creates/overwrites files |
| `packages/opencode/src/tool/edit.ts` | File edit tool | FSUtil, diff | Search-and-replace editing |
| `packages/opencode/src/tool/shell.ts` | Shell command tool | PTY, ShellID | Execute commands in terminal |
| `packages/opencode/src/tool/grep.ts` | Text search tool (ripgrep) | Ripgrep | Grep/search in files |
| `packages/opencode/src/tool/glob.ts` | File globbing tool | Ripgrep | Find files by patterns |
| `packages/opencode/src/tool/task.ts` | Sub-agent delegation tool | Effect | Delegates work to sub-agents |
| `packages/opencode/src/tool/websearch.ts` | Web search tool | WebSearch | Search the web |
| `packages/opencode/src/tool/webfetch.ts` | URL fetch tool | webfetch | Fetch web content |
| `packages/opencode/src/tool/apply_patch.ts` | Apply unified diff tool | diff | Apply git-style patches |
| `packages/opencode/src/tool/question.ts` | User question tool | Question | Ask user for input |
| `packages/opencode/src/tool/skill.ts` | Skill execution tool | Skill | Execute learned skills |
| `packages/opencode/src/tool/plan.ts` | Planning tool | Plan | Create and execute plans |
| `packages/opencode/src/tool/todo.ts` | Todo/checklist tool | Todo | Write todo items |
| `packages/opencode/src/tool/lsp.ts` | LSP query tool (experimental) | LSP | Query language servers |
| `packages/opencode/src/tool/truncate.ts` | Output truncation utility | Truncate | Truncates tool output to fit context |

### Tool Systems — V2

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/tool/tool.ts` | V2 Tool definition (`Tool.make()`) | Effect Schema | Canonical tool design: opaque values with description, input, output, execute |
| `packages/core/src/tool/registry.ts` | V2 Tool Registry (materialize/settle) | Tool, Tools, ApplicationTools, Permission | Merges application + location tools, produces definitions for LLM, settles calls |
| `packages/core/src/tool/tools.ts` | V2 Tools Service (registration) | Effect | Narrow registration interface used by Location producers |
| `packages/core/src/tool/builtins.ts` | V2 built-in tool definitions | All tool modules | The 12 built-in tools for V2 |
| `packages/core/src/tool/application-tools.ts` | V2 application tool registration | Effect | Process-scoped tool registration |
| `packages/core/src/tool/AGENTS.md` | Tool architecture guide | None | Design documentation for V2 tool system |

### Storage

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/database/database.ts` | Database initialization, pragmas, migration runner | Drizzle, SQLite, migration | Creates SQLite connection, applies WAL pragmas, runs migrations |
| `packages/core/src/database/migration.ts` | Migration system | Effect, Database | Applies TypeScript-based migrations in order |
| `packages/core/src/database/migration.gen.ts` | Auto-generated migration imports | All migration files | Generated file that imports all 37 migrations |
| `packages/core/src/database/schema.gen.ts` | Fresh database full schema SQL | Drizzle | Used for new databases (not incremental migrations) |
| `packages/core/src/database/sqlite.bun.ts` | Bun SQLite driver | bun:sqlite, Drizzle | Platform-specific SQLite (Bun) |
| `packages/core/src/database/sqlite.node.ts` | Node SQLite driver | node:sqlite, Drizzle | Platform-specific SQLite (Node 22+) |
| `packages/core/src/event.ts` | Event sourcing backbone | Effect, Database, event/sql | EventV2: define, publish, project, beforeCommit, subscribe |
| `packages/core/src/event/sql.ts` | Event tables (event, event_sequence) | Drizzle | Append-only event log tables |

### Config

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/config.ts` | Config loading, merging, migration | jsonc-parser, path | Loads config from global + project files, merges, validates with Schema |
| `packages/core/src/config/agent.ts` | Agent config schema | Effect Schema | Per-agent configuration |
| `packages/core/src/config/mcp.ts` | MCP server config schema | Effect Schema | Local/Remote MCP server definitions |
| `packages/core/src/config/provider.ts` | Provider config schema | Effect Schema | Provider-specific overrides |
| `packages/core/src/config/plugin.ts` | Plugin config schema | Effect Schema | Plugin/agent/provider/command/skill/reference configs |

### System Context

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/system-context/index.ts` | SystemContext algebra | Effect Schema | Composably defines context sources (key, codec, load, baseline, update, removed) |
| `packages/core/src/system-context/builtins.ts` | Built-in sources: environment, date | SystemContext | Core context: working directory, git status, platform, date |
| `packages/core/src/system-context/registry.ts` | Source registry: register, load, compose | SystemContext | Scoped registry for context sources |

### Event System

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/event.ts` | EventV2: define, publish, project, subscribe, replay | Effect, Database, event/sql | The backbone of all state changes; ensures durability and ordering |
| `packages/core/src/event/sql.ts` | Event tables DDL | Drizzle | event + event_sequence tables |
| `packages/opencode/src/event-v2-bridge.ts` | Bridge between core events and app | EventV2, Plugin | Connects core event bus to the application layer/plugin system |

### Agent System

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/agent.ts` | AgentV2 Service (resolver, selector) | Effect, Database | Manages agent definitions; resolves agents by ID |
| `packages/opencode/src/agent/agent.ts` | V1 Agent system | Effect | Legacy agent management |
| `packages/core/src/plugin/boot.ts` | Plugin boot (providers, agents, skills, etc.) | Everything | Registers all built-in plugin providers/agents on startup |
| `packages/core/src/plugin/provider.ts` | Plugin provider registry | Effect | Maps provider IDs to their implementation modules |

### Provider System

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/opencode/src/provider/provider.ts` | Provider Service: model catalog, AI SDK loading | AI SDK packages, Config, ProviderAuth | Loads provider packages, resolves models, fuzzy-matches model names |
| `packages/opencode/src/provider/transform.ts` | Provider-specific message/param transforms | AI SDK | Handles per-provider differences (images, system prompts, reasoning effort) |
| `packages/core/src/provider.ts` | ProviderV2 schema | Effect Schema | Provider definitions and API type schemas |
| `packages/core/src/model.ts` | ModelV2 schema and catalog | Effect Schema | Model reference types and resolution |
| `packages/core/src/catalog.ts` | Catalog: merges plugins + config, resolves models | Plugin, Config, Credential | Central model/provider resolution |
| `packages/core/src/plugin/provider/*.ts` | 30+ provider implementations | Various | Individual provider integrations (anthropic, openai, google, bedrock, etc.) |

### UI Layer

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/tui/src/index.tsx` | TUI entry: exports `{ run, TuiInput }` | @opentui/solid | Main TUI export |
| `packages/tui/src/app.tsx` | TUI bootstrap: render tree, providers, routing | All TUI modules | Sets up the entire TUI component hierarchy |
| `packages/tui/src/context/sync.tsx` | Master sync state (sessions, messages, parts, etc.) | SDK, Event | Central state store for the TUI; everything rendered goes through this |
| `packages/tui/src/context/data.tsx` | V2 event-driven data context | Event | V2 data context for session.next.* events |
| `packages/tui/src/routes/session/index.tsx` | Session page (message timeline + sidebar + prompt) | Everything | The main session view in the TUI |
| `packages/tui/src/component/prompt/index.tsx` | Prompt input component (~1600 lines) | All TUI components | User input handling: submit, attachment, autocomplete |
| `packages/tui/src/feature-plugins/` | Built-in TUI plugins | TUI plugin API | Sidebar: context, files, MCP, LSP, todos; Home: tips, footer |
| `packages/app/src/pages/session.tsx` | Web app session page (1866 lines) | All app modules | The main session view in the web app |
| `packages/app/src/context/server-sync.tsx` | Web app server sync state | Server SDK, Event | Syncs session state from server for the web app |

### HTTP Server

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/opencode/src/server/server.ts` | HTTP + WebSocket server (Hono-based) | Hono, Effect | Main server entry for headless mode and internal IPC |
| `packages/opencode/src/server/routes/` | HTTP API route definitions | Server | Instance-scoped HTTP API endpoints |

### Plugin System

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/plugin/src/tool.ts` | Plugin tool definition | Effect, Zod | SDK for defining tools in plugins |
| `packages/plugin/src/tui.ts` | Plugin TUI extension | Effect | SDK for TUI plugin slot registration |
| `packages/opencode/src/plugin/` | Runtime plugin loader | Various | Loads and manages plugins at runtime |

### Permissions

| File | Responsibility | Dependencies | Why It Matters |
|------|---------------|--------------|----------------|
| `packages/core/src/permission/schema.ts` | Permission schema (action, resource, ruleset) | Effect Schema | Permission data model |
| `packages/core/src/permission/sql.ts` | Permission tables | Drizzle | Persists saved permissions |
| `packages/core/src/policy.ts` | Policy evaluation engine | Effect | Evaluates provider.use and tool.use policies |

## Minor / Utility Files (Not Documented)

The following directories contain utilities, helpers, and secondary features that don't need detailed documentation:

- `packages/opencode/src/util/` — General utilities
- `packages/opencode/src/format/` — Output formatting
- `packages/opencode/src/id/` — ID generation
- `packages/opencode/src/git/` — Git integration
- `packages/opencode/src/image/` — Image handling
- `packages/opencode/src/shell/` — Shell execution
- `packages/opencode/src/share/` — Session sharing
- `packages/opencode/src/sync/` — Data sync
- `packages/opencode/src/snapshot/` — File snapshots
- `packages/core/src/util/` — Core utilities
- `packages/core/src/filesystem/` — Filesystem abstractions
- `packages/core/src/pty/` — PTY abstractions
- `packages/core/src/image/` — Image processing
- `packages/core/src/git.ts` — Git operations
- `packages/core/src/ripgrep/` — Ripgrep binary management
