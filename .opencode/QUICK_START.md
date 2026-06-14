# OpenCode DevBuddy Quick Start

## What This Repository Is

OpenCode is an open-source AI-powered coding agent that runs locally. It provides a terminal UI (TUI), web app, Electron desktop app, headless API server, and cloud console. This repository is a fork/buddy project for integrating Dev-Intel (repository intelligence) on top of OpenCode.

**License:** MIT
**Package Manager:** Bun 1.3.14
**TypeScript:** 5.8.2
**Effect:** 4.0.0-beta.74
**Monorepo Tool:** Turborepo 2.8.13
**Default Branch:** `dev`

## Major Packages

| Package | Path | Purpose |
|---------|------|---------|
| `opencode` | `packages/opencode/` | Main CLI + TUI + HTTP server. Entry point for users. |
| `@opencode-ai/core` | `packages/core/` | Core business logic. Session V2, runners, storage, config, tools, providers. |
| `@opencode-ai/tui` | `packages/tui/` | Terminal UI (SolidJS + OpenTUI framework). |
| `@opencode-ai/app` | `packages/app/` | Web application (SolidJS + Vite). |
| `@opencode-ai/desktop` | `packages/desktop/` | Electron desktop wrapper. |
| `@opencode-ai/server` | `packages/server/` | Server package (extends core). |
| `@opencode-ai/llm` | `packages/llm/` | Effect Schema-first LLM protocol layer. |
| `@opencode-ai/plugin` | `packages/plugin/` | Plugin SDK for extending OpenCode. |
| `@opencode-ai/sdk` | `packages/sdk/js/` | JavaScript SDK (generated from OpenAPI). |
| `@opencode-ai/ui` | `packages/ui/` | Shared UI components. |
| `@opencode-ai/cli` | `packages/cli/` | Standalone CLI binary. |
| `@opencode-ai/slack` | `packages/slack/` | Slack integration. |
| `@opencode-ai/effect-drizzle-sqlite` | `packages/effect-drizzle-sqlite/` | Drizzle ORM + Effect SQLite adapter (vendored). |
| `@opencode-ai/effect-sqlite-node` | `packages/effect-sqlite-node/` | Node SQLite + Effect adapter. |

## Entry Points

| Entry | File | Description |
|-------|------|-------------|
| **Binary launcher** | `packages/opencode/bin/opencode` | Platform-specific binary spawner |
| **CLI entry** | `packages/opencode/src/index.ts` | Yargs CLI setup with all command modules |
| **AppRuntime (DI container)** | `packages/opencode/src/effect/app-runtime.ts` | `ManagedRuntime` holding all service layers |
| **TUI bootstrap** | `packages/opencode/src/cli/tui/layer.ts` | TUI Effect layer that launches `@opencode-ai/tui` |
| **Core exports** | `packages/core/src/public/index.ts` | Public API: `Agent`, `Model`, `OpenCode`, `Session`, `Tool`, `Location`, `Prompt` |
| **Session runner** | `packages/core/src/session/runner/llm.ts` | V2 durable session runner (LLM + tool loop) |
| **MCP Service** | `packages/opencode/src/mcp/index.ts` | MCP server lifecycle management |

## Important Directories

```
packages/
├── opencode/src/          # Main app: CLI, session (V1 legacy), MCP, tools, config, server, TUI bootstrap
│   ├── cli/               # CLI commands (yargs)
│   ├── session/           # Session management, LLM integration, prompt, processor
│   ├── mcp/               # MCP server management
│   ├── tool/              # Built-in tool definitions (read, write, edit, shell, etc.)
│   ├── server/            # HTTP + WebSocket server
│   ├── effect/            # Effect infrastructure (AppRuntime, InstanceState, etc.)
│   ├── config/            # Config management
│   ├── provider/          # LLM provider integration
│   └── plugin/            # Plugin system
├── core/src/              # Core business logic
│   ├── session/           # V2 session system (runner, event, input, history, context-epoch)
│   ├── tool/              # V2 tool registry and definitions
│   ├── system-context/    # System context algebra and built-ins
│   ├── database/          # SQLite database, migrations
│   ├── config/            # Config schema definitions
│   ├── event/             # Event sourcing infrastructure
│   ├── plugin/            # Plugin provider registry (30+ providers)
│   └── public/            # Public API
├── tui/src/               # Terminal UI (SolidJS components, routes, plugins)
└── app/src/               # Web application
```

## Files That Matter Most

For understanding the application:

1. **`packages/opencode/src/index.ts`** — Main entry, all CLI commands registered here
2. **`packages/opencode/src/effect/app-runtime.ts`** — Central DI container, lists every service layer
3. **`packages/opencode/src/session/prompt.ts`** — Legacy V1 prompt orchestrator (1722 lines, the "big loop")
4. **`packages/opencode/src/session/processor.ts`** — Legacy V1 LLM stream processor (1084 lines)
5. **`packages/opencode/src/session/llm.ts`** — LLM service (streams from providers)
6. **`packages/opencode/src/session/session.ts`** — Session CRUD operations
7. **`packages/opencode/src/mcp/index.ts`** — MCP server lifecycle (~928 lines)
8. **`packages/opencode/src/mcp/catalog.ts`** — MCP tool discovery and conversion
9. **`packages/opencode/src/tool/registry.ts`** — V1 tool registry
10. **`packages/core/src/session.ts`** — V2 session service (create, prompt, resume, interrupt)
11. **`packages/core/src/session/runner/llm.ts`** — V2 durable session runner (the new loop, 404 lines)
12. **`packages/core/src/session/runner/index.ts`** — V2 runner interface
13. **`packages/core/src/session/input.ts`** — V2 prompt admission/promotion lifecycle
14. **`packages/core/src/session/projector.ts`** — V2 event projector (persists events to DB)
15. **`packages/core/src/session/event.ts`** — All V2 session event definitions
16. **`packages/core/src/tool/registry.ts`** — V2 tool registry (new canonical design)
17. **`packages/core/src/tool/tool.ts`** — V2 tool definition (`Tool.make`)
18. **`packages/core/src/system-context/`** — System context algebra
19. **`packages/core/src/database/database.ts`** — Database initialization and migrations
20. **`packages/core/src/event.ts`** — Event sourcing backbone
21. **`packages/core/src/config.ts`** — Config loading and schema

## How to Navigate

- **V2 is the future**: The `packages/core/src/session/` directory contains the new session architecture. The V1 code in `packages/opencode/src/session/` is being replaced.
- **Two registries exist**: `ToolRegistry` in `packages/opencode/src/tool/registry.ts` (V1/AI SDK) and `ToolRegistry` in `packages/core/src/tool/registry.ts` (V2/Effect-native). They are DIFFERENT implementations despite the same name.
- **Event-sourced architecture**: All state changes go through `EventV2.publish()` in `packages/core/src/event.ts`, which sequences events and projects them into SQLite via Drizzle.
- **Effect v4 throughout**: The entire codebase uses Effect.gen, Layer, Schema, Stream, etc.
- **SolidJS for UI**: Both TUI (via OpenTUI) and web app use SolidJS with SolidJS contexts for state management.

## Build & Run Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install all dependencies |
| `bun dev` | Run TUI from packages/opencode |
| `bun dev:desktop` | Electron desktop dev |
| `bun dev:web` | Web app dev |
| `bun lint` | oxlint |
| `bun typecheck` | Turbo typecheck (run from package dirs) |
| `bun turbo test` | Run all tests |
