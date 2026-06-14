# Architectural Decisions

## Recorded Discoveries

### 1. Why V2 Exists

**Decision:** A complete V2 session system was built in `packages/core/src/session/` alongside the legacy V1 system in `packages/opencode/src/session/`.

**Rationale (from code comments in `packages/core/src/session/runner/llm.ts`):**
- V1 `SessionPrompt` had become a 1722-line monolith that was hard to maintain
- V1 used the AI SDK (`ai` package) which introduced unnecessary abstraction and compatibility issues
- Event-sourcing provides better durability guarantees than direct DB writes
- System context algebra replaces ad-hoc system prompt construction
- `@opencode-ai/llm` provides a cleaner Effect-native protocol layer

**Tradeoff:** Two parallel systems increase maintenance burden during migration. New features need to be built knowing which system to target.

### 2. Why Effect v4 Instead of Simpler DI

**Decision:** The entire codebase uses Effect v4's `Layer`, `Context`, `ManagedRuntime` for dependency injection.

**Rationale (inferred from code patterns):**
- Type-safe: all services are typed Context tags, compile-time verification
- Scoped: resources are automatically cleaned up via `Effect.Scope`
- Composable: layers can be merged, provided, and overridden
- Testable: services can be swapped with mocks via layer replacement
- Async-native: Effect handles cancellation, interruption, and error propagation

### 3. Why Event Sourcing (Not Direct DB Writes)

**Decision:** All state changes flow through `EventV2.publish()` before being projected to domain tables.

**Rationale (from `packages/core/src/event.ts`):**
- Durability: events survive crashes (committed before projection)
- Ordering: sequential event numbers prevent race conditions
- Auditability: complete history of all state changes
- Replayability: projectors can be rebuilt from event log
- Consistency: synchronized handlers run in same transaction as event commit

**Tradeoff:** Write amplification (event + projection writes for each change).

### 4. Why Two Tool Registries (V1 and V2)

**Decision:** Different `ToolRegistry` implementations exist in `packages/opencode/src/tool/registry.ts` and `packages/core/src/tool/registry.ts`.

**Rationale (from `packages/core/src/tool/AGENTS.md`):**
- V1 registry is tightly coupled to AI SDK `tool()` format
- V2 introduces `Tool.make()` with Effect Schema-based define/settle
- MCP and plugin tools not yet ported to V2 canonical registration design
- Migration in progress: V2 registry is the target architecture

**Tradeoff:** Confusing naming (same class name, different packages). Tool definitions must be maintained in two formats during migration.

### 5. Why Per-Directory InstanceState

**Decision:** Each project directory gets its own scoped service state via `InstanceState` (backed by `ScopedCache`).

**Rationale (from `packages/opencode/src/effect/instance-state.ts`):**
- Isolated MCP connections per project
- Separate file watchers per project
- Clean cleanup on project close
- Multiple projects can be open simultaneously

### 6. Why Two-Part Session Input Lifecycle (Admitted → Promoted)

**Decision:** Prompts go through a two-phase lifecycle: `admitted` (event-sourced but not visible) → `promoted` (visible as user message).

**Rationale (from `packages/core/src/session/input.ts`):**
- Allows durable admission before execution begins
- Supports two delivery modes: `steer` (immediate, coalesces into active activity) and `queue` (FIFO, next activity)
- Enables race-free handling of prompts arriving during active provider turns
- Provides a clear separation between "accepted" and "visible"

### 7. Why V1 Messages Persist as JSON Blobs

**Decision:** V1 `message` and `part` tables use a `data` JSON column rather than typed columns.

**Rationale:** Flexibility for rapid iteration during early development. The V2 `session_message` table uses typed rows instead.

### 8. Why MCP Integration Lives in `packages/opencode` (Not Core)

**Decision:** The MCP service is in `packages/opencode/src/mcp/`, not in `packages/core/`.

**Rationale:** MCP is an application concern, not a core abstraction. The MCP service depends on `@modelcontextprotocol/sdk` which is a heavy dependency. Core only has the MCP config schema.

### 9. Why TUI Uses WebSocket for Event Streaming

**Decision:** The TUI connects to the backend via WebSocket (internal or external) for real-time event streaming.

**Rationale:** The TUI runs in a separate process (Worker thread). WebSocket provides bidirectional streaming without shared memory, supporting both internal (in-process) and external (remote) modes.

### 10. Why SolidJS (Not React) for UI

**Decision:** Both TUI and web app use SolidJS with SolidJS context providers.

**Rationale (inferred):** Simpler reactivity model, smaller bundle size, better performance (no virtual DOM overhead). The OpenTUI framework is built on SolidJS.

### 11. Why MAX_STEPS = 25

**Decision:** The V2 runner limits provider turns to 25 steps.

**Rationale (from `packages/core/src/session/runner/llm.ts`):** Prevents infinite loops. Matches V1 behavior.

### 12. Why System Context Uses Baseline + Diff Pattern

**Decision:** `SystemContext` provides a `baseline` (initial full text), `update` (diff between old and new), and `removed` (notification) pattern.

**Rationale (from `packages/core/src/system-context/index.ts`):** Efficient for LLM context: full text on first load, incremental diffs on refresh. Avoids sending unchanged context repeatedly.

### 13. Why Auth/Provider Credentials Are Separate from Config

**Decision:** Provider credentials are stored in a `credential` table and `auth` module, not in config files.

**Rationale:** Credentials are sensitive data that shouldn't live in version-controlled config files. The credential system supports integration-based credential resolution.
