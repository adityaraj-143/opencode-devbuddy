# Storage Flow: Persistence Layer

## What Survives Application Restarts

**Everything in SQLite persists.** The database is on-disk at `~/.local/share/opencode/opencode.db` (or channel-suffixed).

## Database Location

```
~/.local/share/opencode/opencode.db          # Default
~/.local/share/opencode/opencode-dev.db      # Dev channel
~/.local/share/opencode/opencode-beta.db     # Beta channel
```

Overridable via `OPENCODE_DB` env var.

XDG-based directories:

| Variable | Path | Purpose |
|----------|------|---------|
| `Global.Path.data` | `~/.local/share/opencode` | Main database + data |
| `Global.Path.config` | `~/.config/opencode` | User configuration files |
| `Global.Path.cache` | `~/.cache/opencode` | Binary cache |
| `Global.Path.state` | `~/.local/state/opencode` | Runtime state |
| `Global.Path.tmp` | `$TMPDIR/opencode` | Temporary files |
| `Global.Path.log` | `~/.local/share/opencode/log` | Log files |
| `Global.Path.repos` | `~/.local/share/opencode/repos` | Git repos |

## Database Schema (All Tables)

### Core Domain Tables (`packages/core/src/session/sql.ts`)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `session` | `id`, `project_id`, `workspace_id`, `directory`, `title`, `version`, `agent`, `model` (JSON), `tokens_input/output/reasoning/cache_*`, `cost`, `time_created/updated` | Session metadata |
| `session_message` | `id`, `session_id`, `type`, `seq`, `data` (JSON), `time_created/updated` | Projected V2 messages |
| `session_input` | `id`, `session_id`, `prompt` (JSON), `delivery` (steer|queue), `admitted_seq`, `promoted_seq`, `time_created` | V2 prompt admission lifecycle |
| `session_context_epoch` | `session_id`, `baseline`, `agent`, `snapshot` (JSON), `baseline_seq`, `replacement_seq`, `revision` | System context versions |

### Legacy V1 Tables

| Table | Purpose |
|-------|---------|
| `message` | V1 messages (JSON blobs in `data` column) |
| `part` | V1 message parts (JSON blobs in `data` column) |

### Event Sourcing Tables (`packages/core/src/event/sql.ts`)

| Table | Purpose |
|-------|---------|
| `event` | Append-only event log: `id`, `aggregate_id`, `seq`, `type`, `data` (JSON) |
| `event_sequence` | Current sequence per aggregate: `aggregate_id`, `seq`, `owner_id` |

### Other Persistent Tables

| Table | File | Purpose |
|-------|------|---------|
| `project` | `packages/core/src/project/sql.ts` | Project metadata (worktree, VCS, name, icon) |
| `project_directory` | `packages/core/src/project/sql.ts` | Project directories (main, root, git_worktree) |
| `workspace` | `packages/core/src/control-plane/workspace.sql.ts` | Workspace definitions |
| `account` | `packages/core/src/account/sql.ts` | User accounts (email, tokens) |
| `account_state` | `packages/core/src/account/sql.ts` | Active account/org state |
| `permission` | `packages/core/src/permission/sql.ts` | Saved permissions |
| `credential` | `packages/core/src/credential/sql.ts` | Provider credentials |
| `session_share` | `packages/core/src/share/sql.ts` | Shared session metadata |
| `todo` | `packages/core/src/session/sql.ts` | Session todo items |
| `data_migration` | `packages/core/src/data-migration.sql.ts` | Completed migration tracking |
| `integration` | `packages/core/src/integration/schema.ts` | Integration connections |
| `connection` | `packages/core/src/integration/connection.ts` | Integration connection details |

## What Is Ephemeral (Does Not Survive Restarts)

| Data | Why Ephemeral |
|------|--------------|
| In-memory session state (active fibers, run loops) | Re-created on next prompt |
| Streamed deltas (text, reasoning, tool input) | Explicitly ephemeral per spec; only full events persisted |
| SessionExecution coordinator state (run/wake queues) | Process-local; recreated on restart |
| LocationServiceMap cache | Process-local location-to-service mapping |
| Database connection cache | Re-opened on startup (WAL may have uncheckpointed frames) |
| In-memory caches (RcMap, memoMap) | Rebuilt as services are accessed |

## Write Path: Event Sourcing

```
SessionV2.prompt() / SessionInput.admit()
    │
    ▼
EventV2.publish(sessionID, event)
    │  File: packages/core/src/event.ts
    │
    ├── BEFORE_COMMIT handlers run (synchronized)
    ├── → INSERT INTO event (aggregate_id, seq, type, data)
    ├── → UPSERT event_sequence (increment seq)
    └── Commit SQLite transaction
    │
    ▼
EventV2.project(sessionID, cutoff)
    │
    ├── Loads unprojected events
    ├── For each event type, calls registered projector handler
    └── Projectors update: session_message, session, session_context_epoch, etc.
    │
    ▼
SessionProjector (packages/core/src/session/projector.ts)
    ├── Admitted → session_input row
    ├── Promoted → session_message row (type: user)
    ├── Prompt.LegacyPrompted → session_message row
    ├── Step.* → session_message row (type: assistant)
    ├── Text.* → updates session_message data (text content)
    ├── Reasoning.* → updates session_message data (reasoning content)
    ├── Tool.* → updates session_message data (tool calls/results)
    ├── ModelSwitched → updates session.model
    ├── AgentSwitched → updates session.agent, context_epoch
    └── Compaction.* → session_context_epoch, session_message (type: compaction)
```

## Read Path: Drizzle Queries

```
SessionV2.get(sessionID)
    │
    ▼
SessionStore.get(db, sessionID)
    │  File: packages/core/src/session/store.ts
    │
    ├── SELECT * FROM session WHERE id = ?
    └── → fromRow() → SessionSchema.Info

SessionHistory.entriesForRunner(db, sessionID, baselineSeq)
    │  File: packages/core/src/session/history.ts
    │
    ├── SELECT * FROM session_message WHERE session_id = ? ORDER BY seq
    ├── Apply compaction truncation (skip messages before latest compaction)
    └── → Array<{ seq, message: SessionMessage }>
```

## Migrations

37 code migrations in `packages/core/src/database/migration/*.ts`.

**Design:** TypeScript-based (not SQL files). Each migration exports `{ id, up: (tx) => Effect<void> }`.

**Application:**
1. Check if `session` table exists → needs full init or migration
2. If new DB → run `schema.gen.ts` full schema, mark all migrations done
3. If existing DB → check `data_migration` table, run uncompleted migrations in order
4. Seeds from old `__drizzle_migrations` table if migrating from pre-migration era

Key migration: `20260604172448_event_sourced_session_input` — Deleted/recreated `session_input`, `session_message`, `event`, `event_sequence` tables (V2 cutover).

## Configuration Storage

File-based (not SQLite):

| Location | Priority | Format |
|----------|----------|--------|
| `~/.config/opencode/opencode.json` | Lowest (global defaults) | JSON/JSONC |
| `{project}/opencode.json` | Medium | JSON/JSONC |
| `{project}/.opencode/` directory | Highest | JSON files |

Config discovery walks up from project directory. Later overrides earlier. Supports `$schema`, JSONC comments, V1→V2 auto-migration.

## MCP Auth Storage

```
~/.local/share/opencode/data/mcp-auth.json
```
JSON file storing OAuth tokens per MCP server instance (directory-scoped).

## Legacy File Storage

`packages/opencode/src/storage/storage.ts` provides a file-based JSON key-value store under:
```
~/.local/share/opencode/storage/{domain}/{key}.json
```
With per-file `TxReentrantLock` for concurrent access. Being phased out in favor of SQLite.

## Key Storage Files

| File | Purpose |
|------|---------|
| `packages/core/src/database/database.ts` | Database init, pragmas, migration runner |
| `packages/core/src/database/migration.ts` | Migration system (apply, rollback tracking) |
| `packages/core/src/database/sqlite.bun.ts` | Bun SQLite driver setup |
| `packages/core/src/database/sqlite.node.ts` | Node SQLite driver setup |
| `packages/core/src/database/schema.gen.ts` | Full schema SQL for fresh DBs |
| `packages/core/src/event.ts` | Event sourcing backbone (publish, project, replay) |
| `packages/core/src/event/sql.ts` | Event/EventSequence table definitions |
| `packages/core/src/session/sql.ts` | All session-related table definitions |
| `packages/core/src/session/store.ts` | Session data access layer |
| `packages/core/src/session/projector.ts` | Event projection into tables |
| `packages/core/src/session/input.ts` | Prompt admission/promotion lifecycle |
| `packages/core/src/config.ts` | Config loading and merging |
| `packages/opencode/src/storage/storage.ts` | Legacy file-based JSON storage |
| `packages/opencode/src/mcp/auth.ts` | MCP OAuth token storage |
| `packages/core/src/global.ts` | XDG path resolution |
