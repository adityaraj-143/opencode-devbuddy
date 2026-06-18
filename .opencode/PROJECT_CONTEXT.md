# Project Context: Living Repository Understanding

## What OpenCode Is

OpenCode is an open-source AI-powered coding agent that runs locally. It provides:
- **Terminal UI (TUI)** — interactive session in the terminal (primary interface)
- **Web App** — browser-based interface
- **Desktop App** — Electron wrapper
- **Headless API Server** — for integration with editors, CI/CD, etc.
- **Cloud Console** — SSO, billing, team management for enterprise

It is NOT an IDE — it's an AI assistant that operates on codebases through file operations, shell commands, and tool execution.

## Core Goals

1. **Local-first** — All data stored locally by default; optional cloud sync
2. **Model agnostic** — Supports 30+ LLM providers (Anthropic, OpenAI, Google, AWS Bedrock, etc.)
3. **Extensible** — Plugin system, MCP integration, custom tools, custom agents
4. **Session durability** — Conversations survive restarts, crashes, and network failures
5. **Event-sourced architecture** — All state changes are recorded as events for auditability and replay

## Current Architecture

### Effect v4 Throughout

The entire server-side codebase uses Effect v4 for:
- Dependency injection (very few actual global variables outside Effect)
- Effect `Layer`s for service wiring
- Effect `Schema` for runtime type validation
- Effect `Stream` for LLM event streaming
- Effect `ManagedRuntime` for the DI container

### Two Tracks: V1 Legacy and V2 Future

The codebase is mid-migration:

**V1 (Legacy)** — `packages/opencode/src/session/`:
- Uses the AI SDK (`ai` package) for provider streaming
- `SessionPrompt` (1722 lines) is the big orchestrator
- `SessionProcessor` (1084 lines) processes LLM streams
- Tools defined via AI SDK `tool()` pattern
- Actively used by TUI/CLI today

**V2 (Future)** — `packages/core/src/session/`:
- Uses `@opencode-ai/llm` directly (Effect-native, no AI SDK)
- Event-sourced architecture for durability
- `SessionRunner` (404 lines) handles one provider turn
- Tools defined via `Tool.make()` (Effect Schema-based)
- System context algebra for composable context
- Being rolled out; not yet the default for TUI

### Event Sourcing

All persistent state changes go through `EventV2.publish()`:
1. Event is sequenced (event_sequence table)
2. Event is appended (event table)
3. Synchronized event handlers run (in same transaction)
4. Projectors read events and update domain tables
5. Listeners react asynchronously

This provides: durability, ordering, replayability, and auditability.

### Location-Scoped Services

Each project directory gets its own service graph:
- MCP connections
- Tool registrations
- Config
- Watchers

Managed via `LocationServiceMap` and `InstanceState`.

## Major Design Philosophies

1. **"Keep moving to V2"** — The V1 code in `packages/opencode/src/session/` is being progressively replaced by V2 code in `packages/core/src/session/`. New features should target V2.

2. **"Event-sourced projections"** — All writes go through events; reads go through Drizzle queries on projected tables. This prevents inconsistent state.

3. **"Safe defaults, extensible everything"** — Everything is overridable: agents, providers, tools, config. The plugin system and MCP are first-class citizens.

4. **"System context as algebra"** — Context sources are composable, typed, independently refreshable. This replaces ad-hoc system prompt construction.

5. **"Contracts over configuration"** — Effect Schema is used extensively for type-safe contracts between subsystems.

6. **"Scoped lifecycles"** — InstanceState, Layer, FiberSet, ScopedCache all ensure resources are cleaned up when no longer needed.

7. **"Event bus over callbacks"** — Cross-module communication goes through EventV2, not direct function calls.

## Potential Alignment with Dev-Buddy

Dev-Buddy needs to:
1. **Load project memory** — Read project context, codebase analysis, and developer conventions
2. **Inject memory into prompts** — Before LLM calls, add relevant context
3. **Observe tool execution** — Track what the AI is doing for learning
4. **Persist learned information** — Save discoveries back to memory
5. **Show memory in UI** — Display project context in sidebars

OpenCode provides natural hooks for all of these:

| Dev-Buddy Need | OpenCode Hook |
|---------------|---------------|
| Load project memory | `SystemContextRegistry.register()` source |
| Inject into prompts | `SystemContext.Source` → automatically loaded before each turn |
| Observe tools | `EventV2.subscribe(Tool.*)` |
| Persist memory | New Drizzle table + EventV2 for durability |
| Show in UI | TUI plugin slot `sidebar_content` |

The V2 System Context algebra is the **ideal integration point**. By registering a `SystemContext.Source("dev-intel/project-memory")`, Dev-Buddy data is automatically:
- Loaded before each LLM turn
- Combined with other context sources
- Versioned and diffed (baseline + updates pattern)
- Persisted in `session_context_epoch`
- Recovered across session restarts

## Key Constraints

- `packages/core/src/session/runner/llm.ts` is the critical path — minimize modifications
- V1 code (`packages/opencode/src/session/prompt.ts`, `processor.ts`) is being replaced — avoid deep integration
- EventV2 is the sole durable write path — use its APIs
- SystemContext is composable — add sources, don't modify the algebra
- TUI plugin system expects `BuiltinTuiPlugin` pattern with `api.slots.register()`
