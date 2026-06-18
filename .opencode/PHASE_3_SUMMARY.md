# Phase 3: Session Tracking — Complete Summary

## Overview

Phase 3 adds persistent session tracking to Dev-Intel. Every period of developer activity in a project is recorded as a Dev-Intel session in SQLite, tracking what tools were used, which files were touched, how many messages were sent, and which branch was active.

This data is stored in the Dev-Intel SQLite database (not `.devintel/` files), maintaining the separation between **project knowledge** (`.devintel/`) and **runtime history** (SQLite).

---

## What Was Built

### Package: `@opencode-ai/devintel` (`packages/devintel/`)

Four new modules in `src/sessions/`:

### 1. Types (`src/sessions/types.ts`)

```typescript
interface DevIntelSession {
  id: string              // dis_ prefix
  projectId: string
  startedAt: number
  endedAt?: number
  duration?: number       // computed from startedAt - endedAt
  activeBranch?: string
  currentTaskId?: string
  filesTouched: string[]
  toolsUsed: string[]
  messagesSent: number
  timeCreated: number
  timeUpdated: number
}
```

### 2. SQLite Schema (`src/sessions/schema.sql.ts`)

```sql
CREATE TABLE dev_intel_session (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  active_branch   TEXT,
  current_task_id TEXT,
  files_touched   TEXT NOT NULL DEFAULT '[]',   -- JSON array of file paths
  tools_used      TEXT NOT NULL DEFAULT '[]',    -- JSON array of tool names
  messages_sent   INTEGER NOT NULL DEFAULT 0,
  time_created    INTEGER NOT NULL,
  time_updated    INTEGER NOT NULL
);
```

JSON arrays are used for `files_touched` and `tools_used` — simple, no join tables needed for the MVP. Arrays are deduplicated (same tool/file tracked only once per session).

### 3. Store (`src/sessions/store.ts`)

Data access layer with Effect-based CRUD:

| Function | Description |
|----------|-------------|
| `insert(input)` | Creates a new session row |
| `findActiveByProject(projectId)` | Returns the most recent session with `ended_at IS NULL` |
| `findById(id)` | Single session lookup |
| `findRecentByProject(projectId, limit)` | Returns sessions ordered by `started_at DESC` |
| `endSession(id)` | Sets `ended_at` to now |
| `addFileTouch(id, path)` | Appends a file path (deduplicated) |
| `addToolUsage(id, name)` | Appends a tool name (deduplicated) |
| `incrementMessageCount(id)` | Atomically increments `messages_sent` |
| `attachTask(id, taskId)` | Sets `current_task_id` |

### 4. Session Tracker (`src/sessions/tracker.ts`)

The main service + event observer, registered as `@opencode/v2/devintel/SessionTracker`.

#### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `startSession` | `(projectId, branch?) => Effect<string>` | Creates a new session. Auto-detects git branch from `.git/HEAD` if not provided. |
| `endSession` | `(sessionId) => Effect<void>` | Marks session as ended, computes duration. |
| `getActiveSession` | `(projectId) => Effect<DevIntelSession \| undefined>` | Returns the latest non-ended session for a project. |
| `recordToolUsage` | `(sessionId, toolName) => Effect<void>` | Records a tool used during the session. Deduplicates. |
| `recordFileTouch` | `(sessionId, filePath) => Effect<void>` | Records a file touched during the session. Deduplicates. |
| `recordMessage` | `(sessionId) => Effect<void>` | Increments the message counter. |
| `attachTask` | `(sessionId, taskId) => Effect<void>` | Associates the session with a task from `.devintel/tasks.json`. |
| `getRecentSessions` | `(projectId, limit?) => Effect<DevIntelSession[]>` | Returns recent sessions for a project. |

#### Branch Detection

Branch is read from `.git/HEAD` at session start — no `git` CLI dependency:
```
.read .git/HEAD → "ref: refs/heads/main" → "main"
```

---

## Events Consumed

The session tracker registers a second `EventV2.listen()` subscription (independent of the existing Phase 1/2 observer).

| Event Type | Action |
|------------|--------|
| `session.next.prompt.admitted` | Creates a session if none active, records a message |
| `session.next.tool.called` | Records the tool name (`event.data.tool`) |
| `session.next.tool.success` | Records file paths from `event.data.outputPaths` |

All events are filtered by `event.location.directory` to resolve the project ID via `DevIntelProjects.ensureRegistered()`.

**No modifications to OpenCode core were required.** All integration is via safe `EventV2.listen()` subscriptions.

---

## Files Changed

### New Files (4)

| File | Purpose |
|------|---------|
| `packages/devintel/src/sessions/types.ts` | DevIntelSession type |
| `packages/devintel/src/sessions/schema.sql.ts` | Drizzle table definition |
| `packages/devintel/src/sessions/store.ts` | Data access layer |
| `packages/devintel/src/sessions/tracker.ts` | Service + EventV2 observer |

### Modified Files (4)

| File | Change |
|------|--------|
| `packages/devintel/src/storage/migration.ts` | Registered `002_dev_intel_session` migration |
| `packages/devintel/src/storage/migrations/002_dev_intel_session.ts` | **New** — Migration SQL for `dev_intel_session` table |
| `packages/devintel/src/index.ts` | Added exports for `DevIntelSessionTracker` and `DevIntelSession` type |
| `packages/devintel/src/layer.ts` | Added `DevIntelSessionTracker.Service` + `sessionObserverLayer` |

---

## Tests

13 tests in `packages/devintel/test/session.test.ts`:

| Test | What It Verifies |
|------|-----------------|
| `startSession creates a new session` | Returns `dis_`-prefixed ID |
| `getActiveSession returns the active session` | Active session is the latest un-ended one |
| `endSession marks the session as ended` | `endedAt` is set, `duration` computed |
| `ended session no longer appears as active` | `getActiveSession` returns undefined |
| `recordToolUsage records tool names` | Tools are appended |
| `recordToolUsage deduplicates same tool` | Same tool stored once |
| `recordFileTouch records file paths` | Paths are appended |
| `recordFileTouch deduplicates same path` | Same path stored once |
| `recordMessage increments message count` | Counter increments correctly |
| `attachTask sets the current task ID` | `currentTaskId` is persisted |
| `getRecentSessions returns ordered results` | Most recent session is first |
| `startSession detects branch from .git/HEAD` | Git branch is auto-detected |
| `fails for unknown project ID` | `ProjectNotFound` error thrown |

All tests use in-memory SQLite (`:memory:`) + temporary project directories.

---

## Database Schema

### Migration: `20260614_002_dev_intel_session`

Applied automatically by the existing migration runner (same mechanism as Phase 1's `001_project_table`). Follows Drizzle conventions with snake_case column names.

### Storage Strategy

| Data | Location | Format | Why |
|------|----------|--------|-----|
| Session metadata | SQLite (`devintel.db`) | `dev_intel_session` table | Needs queries (active, recent, by project) and joins with project registry |
| Session files/tools | SQLite (JSON arrays) | `files_touched`, `tools_used` columns | Simple, no joins needed for MVP; normalized tables can be introduced later |
| Branch history | SQLite | `active_branch` column | Read from `.git/HEAD` at session start |
| Task association | SQLite | `current_task_id` column | References `tasks.json` by task ID |

---

## Architecture Decisions

### Why SQLite, Not `.devintel/`

Per the integration plan: `.devintel/` = project knowledge (human-editable, version-controllable), SQLite = runtime history (needs queries, aggregations, joins). Sessions are queried by project, recency, and active status — these are DB operations, not file read operations.

### Why JSON Arrays for Files/Tools

Two strategies were considered:
1. **JSON arrays in a single column** (chosen) — Simpler, fewer queries, deduplication logic in JavaScript
2. **Normalized join tables** (`session_files`, `session_tools`) — More queryable but over-engineered for Phase 3

JSON arrays keep the schema simple. If querying individual file paths or tool names by session becomes a bottleneck, join tables can be introduced in a future phase via a new migration.

### Why a Separate EventV2 Listener

The session tracker has its own `events.listen()` subscription, independent of the Phase 1/2 observer. Reasons:
- **Separation of concerns**: Project registration + memory init vs session tracking
- **Independent lifecycle**: Each listener can fail independently without affecting the other
- **Testability**: Session tests don't need to set up memory layers

### Why No Auto-End on Inactivity

Session end is an explicit API call (`endSession`). Auto-detection of inactivity timeouts was considered but deferred — it requires:
- A timer/heartbeat mechanism
- Configuration (timeout duration)
- A background fiber to check idle sessions

This is appropriate for a future phase or consumer integration. For now, the consumer (or a future TUI plugin) calls `endSession` when appropriate.

---

## Dependency Graph

```
DevIntelSessionTracker.Service
  └── requires DevIntelDb.Service          (via DevIntelSessionStore)
  └── requires DevIntelProjects.Service    (to resolve projectId from directory)

sessionObserverLayer
  └── requires DevIntelSessionTracker.Service
  └── requires DevIntelProjects.Service
  └── requires EventV2.Service

DevIntelLayer.layer
  └── DevIntelDb.defaultLayer
  └── DevIntelProjects.Service
  └── DevIntelProjectMemory.Service
  └── DevIntelSessionTracker.Service
  └── observerLayer     (Phase 1/2: project registration + memory init)
  └── sessionObserverLayer   (Phase 3: session tracking)
```

---

## Future Integration Points (Phase 4+)

| Phase | Dependency on Phase 3 |
|-------|----------------------|
| **Phase 4 (Resume Briefings)** | Read last active session to generate resume context — project, branch, recent files, active task |
| **Phase 5 (Activity Logging)** | Session `toolsUsed` and `filesTouched` feed into the activity timeline |
| **Phase 7 (Memory Injection)** | Session context (current task, recent files, active branch) injected via SystemContext.Source |
| **TUI Enhancements** | Display active session status, recent sessions list, session duration |
