# Agent Flow: User Message → Final Response

## Overview

There are two parallel session systems. V1 (legacy) is active for the current TUI/CLI. V2 (future) is being rolled out. This document covers both.

## V2 Flow (Future, Preferred)

```
User Input
    │
    ▼
[1] UI Layer (TUI/Web/CLI)
    │  File: packages/tui/src/component/prompt/index.tsx
    │     or packages/app/src/context/prompt.tsx
    │     or packages/opencode/src/cli/cmd/run.ts (non-interactive)
    │
    ▼
[2] SDK Interface
    │  SDK session.prompt({ sessionID, prompt, delivery })
    │  Files: packages/sdk/js/src/ (client), packages/opencode/src/server/routes/
    │
    ▼ (via HTTP or in-process bridge)
[3] SessionV2.prompt()
    │  File: packages/core/src/session.ts
    │  Steps:
    │    a. Validates session exists
    │    b. Generates SessionMessage.ID
    │    c. SessionInput.admit() → publishes Admitted event
    │       File: packages/core/src/session/input.ts
    │       - Creates session_input row (admitted_seq, delivery: "steer"|"queue")
    │    d. If resume !== false, calls execution.wake(sessionID)
    │       File: packages/core/src/session/execution.ts
    │
    ▼
[4] SessionRunCoordinator.run()
    │  File: packages/core/src/session/run-coordinator.ts
    │  State machine: idle → draining → draining+coalesced rerun → idle
    │  Delegates to SessionRunner.run()
    │
    ▼
[5] SessionRunner.run()
    │  File: packages/core/src/session/runner/llm.ts
    │
    ├── a. Load session from DB (SessionStore.get)
    ├── b. Select agent (AgentV2.Service.select)
    ├── c. Initialize/Reconcile System Context
    │      File: packages/core/src/session/context-epoch.ts
    │      - SystemContextRegistry.load() (registry.ts)
    │      - Built-in sources: environment, date (builtins.ts)
    │      - Skill guidance, reference guidance
    │      - Reconcile or replace context baseline
    ├── d. Promote pending inputs
    │      - SessionInput.promoteSteers() → publishes Promoted events
    │      - SessionProjector projects into session_message table
    │      File: packages/core/src/session/projector.ts
    ├── e. Load projected history
    │      File: packages/core/src/session/history.ts
    ├── f. Materialize tools
    │      File: packages/core/src/tool/registry.ts
    │      - Merges application + location tool registrations
    │      - Filters by permissions
    │      - Returns definitions + settle() function
    ├── g. Build LLM request
    │      - System: agent system prompt + context baseline
    │      - Messages: history → toLLMMessages()
    │        File: packages/core/src/session/runner/to-llm-message.ts
    │      - Tools: materialized definitions
    │      - Model: resolved from session model ref
    │        File: packages/core/src/session/runner/model.ts
    │
    ▼
[6] LLM.stream(request) → Stream<LLMEvent>
    │  File: packages/packages/llm/ (protocol layer)
    │  One provider turn = exactly one API call
    │
    ▼
[7] Event Processing Loop (runs for each event in stream)
    │  Files: packages/core/src/session/runner/publish-llm-event.ts
    │         packages/core/src/session/runner/llm.ts (lines 245-283)
    │
    ├── Text events → SessionEvent.Text.Started/Delta/Ended
    ├── Reasoning events → SessionEvent.Reasoning.Started/Delta/Ended
    ├── Tool call events → SessionEvent.Tool.Called
    │   └── → toolMaterialization.settle()
    │       File: packages/core/src/tool/registry.ts
    │       - Looks up tool by name
    │       - Decodes input via tool schema
    │       - Executes tool (filesystem, shell, web, etc.)
    │       - Encodes output
    │       - Bounds output via ToolOutputStore
    │       - Persists Tool.Success/Failed events
    │   └── → results → next turn if continuation needed
    ├── Provider errors → SessionEvent.Step.Failed
    └── Compaction needed → compactAfterOverflow / compactIfNeeded
        File: packages/core/src/session/compaction.ts
    │
    ▼
[8] Post-Turn Maintenance
    ├── Check for new steer inputs (accepted during turn)
    ├── Check for queue inputs
    ├── Continue loop (up to MAX_STEPS = 25)
    └── StepLimitExceeded if exceeded
    │
    ▼
[9] Events → SessionProjector → SQLite Tables
    │  Files: packages/core/src/session/projector.ts
    │  Writes to: session_message, session, session_context_epoch, event
    │
    ▼
[10] UI Update
    │  Via EventV2Bridge → WebSocket → TUI/Web
    │  File: packages/opencode/src/event-v2-bridge.ts
    │
    ▼
[11] User sees response
```

## V1 Flow (Legacy, Currently Active)

```
User Input
    │
    ▼
[1] UI Layer (same as V2)
    │
    ▼
[2] SDK Interface → Server Handler
    │  File: packages/opencode/src/server/routes/
    │
    ▼
[3] Session.prompt() or SessionPrompt.prompt()
    │  File: packages/opencode/src/session/prompt.ts (1722 lines)
    │  File: packages/opencode/src/session/session.ts
    │
    ├── Create/resume session in DB
    ├── Build system prompt (system.ts + txt templates in prompt/)
    ├── Resolve tools (tools.ts: ToolRegistry + MCP + Plugin)
    ├── Create SessionProcessor (processor.ts)
    │
    ▼
[4] SessionProcessor.process()
    │  File: packages/opencode/src/session/processor.ts (1084 lines)
    │
    ├── Build AI SDK stream via LLM.stream()
    │  File: packages/opencode/src/session/llm.ts
    │  File: packages/opencode/src/session/llm/request.ts
    │  File: packages/opencode/src/session/llm/ai-sdk.ts (AI SDK adapter)
    │
    ▼
[5] Stream Processing Loop
    ├── Text deltas → persisted as Part updates
    ├── Reasoning deltas → persisted
    ├── Tool calls → execute via EffectBridge
    │   - Permission check (permission/index.ts)
    │   - Execute built-in/custom/MCP/plugin tool
    │   - Truncate output
    │   - Publish result
    ├── Compaction if overflow
    ├── Retry on error
    └── Loop until stop/continue/compact
    │
    ▼
[6] Session events → EventV2Bridge → UI
    │  File: packages/opencode/src/event-v2-bridge.ts
    │
    ▼
[7] User sees response
```

## Key Files for Each Stage

| Stage | Files |
|-------|-------|
| User Input | `packages/tui/src/component/prompt/index.tsx`, `packages/app/src/context/prompt.tsx` |
| SDK/Transport | `packages/sdk/js/src/client/`, `packages/opencode/src/server/routes/` |
| Session Create | `packages/core/src/session.ts` (V2), `packages/opencode/src/session/session.ts` (V1) |
| Input Admission | `packages/core/src/session/input.ts` |
| Execution Wake | `packages/core/src/session/run-coordinator.ts`, `packages/core/src/session/execution/local.ts` |
| Runner | `packages/core/src/session/runner/llm.ts` (V2), `packages/opencode/src/session/prompt.ts` (V1) |
| System Context | `packages/core/src/system-context/builtins.ts`, `packages/core/src/system-context/registry.ts` |
| Context Epoch | `packages/core/src/session/context-epoch.ts` |
| Tool Registry | `packages/core/src/tool/registry.ts` (V2), `packages/opencode/src/tool/registry.ts` (V1) |
| Tool Execution | `packages/core/src/tool/tool.ts` (V2), `packages/opencode/src/session/tools.ts` (V1) |
| LLM Streaming | `packages/opencode/src/session/llm.ts`, `packages/opencode/src/session/llm/ai-sdk.ts`, `packages/llm/` |
| Event Publishing | `packages/core/src/session/runner/publish-llm-event.ts`, `packages/core/src/event.ts` |
| Projection | `packages/core/src/session/projector.ts` |
| Compaction | `packages/core/src/session/compaction.ts` |
| UI Update | `packages/tui/src/context/sync.tsx`, `packages/tui/src/context/data.tsx` |

## Important Notes

- **The V2 runner uses `@opencode-ai/llm` directly** (not the AI SDK `ai` package). The V1 path uses the AI SDK.
- **Tool calls are persisted BEFORE execution** in V2. The tool call event is published, then the tool executes. If execution fails, the failure is recorded alongside the call.
- **Tools execute concurrently** via `FiberSet.run(toolFibers)` in V2. The runner waits for all tool fibers to settle before the next provider turn.
- **The V2 runner has two recovery paths**: `compactAfterOverflow` (try to recover by compacting, then retry the turn) and `rebuildPreparedTurn` (reload everything from scratch if session changed concurrently).
- **System context is versioned** via `session_context_epoch` with optimistic concurrency control. If another agent replaced the context concurrently, the runner detects the revision mismatch and restarts.
