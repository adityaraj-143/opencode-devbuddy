# Dev-Intel Integration Plan

> Architecture and implementation guide for building a persistent developer intelligence layer on top of OpenCode.
>
> Base documents: `.opencode/{QUICK_START,SYSTEM_MAP,CODEBASE_MAP,AGENT_FLOW,MCP_FLOW,STORAGE_FLOW,EXTENSION_POINTS,PROJECT_CONTEXT,DECISIONS,ARCHITECTURE_DIAGRAMS}.md`
>
> Vision: `.opencode/DEVINTEL_VISION.md`
> Roadmap: `.opencode/ROADMAP.md`

---

## Table of Contents

1. [Architecture Strategy](#1-architecture-strategy)
2. [Proposed Package Structure](#2-proposed-package-structure)
3. [Storage Architecture](#3-storage-architecture)
4. [Integration Points](#4-integration-points)
5. [Phase-by-Phase Implementation Plan](#5-phase-by-phase-implementation-plan)
6. [Event Architecture](#6-event-architecture)
7. [Data Models](#7-data-models)
8. [Risk Analysis](#8-risk-analysis)
9. [Recommended MVP Scope](#9-recommended-mvp-scope)
10. [Future Opportunities](#10-future-opportunities)

---

## 1. Architecture Strategy

### 1.1 Integration Philosophy

Dev-Intel must integrate as an **extension layer**, not a fork. Every decision must preserve easy merging of upstream OpenCode updates.

**The golden rule:** Add new Effect Layers, Drizzle tables, TUI plugins, and SystemContext sources. Never modify existing OpenCode internals.

### 1.2 Safe Extension Zones

| Zone | Mechanism | Files to Add/Touch |
|------|-----------|-------------------|
| **System Context** | `SystemContextRegistry.register()` | `packages/devintel/src/memory/*.ts` — new files only |
| **Event Observation** | `EventV2.subscribe()` | `packages/devintel/src/observer/*.ts` — new files only |
| **Persistence** | New Drizzle tables + migrations | `packages/devintel/src/storage/schema.sql.ts` + migration file |
| **Service Layer** | `Layer.mergeAll` in AppRuntime | `packages/opencode/src/effect/app-runtime.ts` — add one line |
| **TUI Display** | `api.slots.register()` in TUI plugin | `packages/devintel/src/tui/*.tsx` — new files only |
| **Config** | Extend `Config.Info` schema | `packages/core/src/config.ts` — add optional fields |

### 1.3 Dangerous Modification Zones

| Zone | Risk | Why |
|------|------|-----|
| `packages/core/src/session/runner/llm.ts` | **CRITICAL** | Upstream rewrites will conflict; inject via SystemContext instead |
| `packages/core/src/event.ts` | **HIGH** | Core infrastructure; use its APIs not its internals |
| `packages/core/src/session/input.ts` | **HIGH** | Session input lifecycle is stable V2 code |
| `packages/core/src/session/projector.ts` | **HIGH** | Projection pipeline must not diverge from upstream |
| `packages/opencode/src/session/prompt.ts` | **MODERATE** | V1 legacy, being replaced; avoid deep integration |
| `packages/opencode/src/session/processor.ts` | **MODERATE** | V1 legacy, being replaced; avoid deep integration |

### 1.4 Minimizing Merge Conflicts

1. **Keep Dev-Intel in its own package** (`packages/devintel/`). Upstream changes to OpenCode packages will never touch Dev-Intel files.
2. **The only files that cross the boundary** are:
   - `packages/opencode/src/effect/app-runtime.ts` — one `Layer.mergeAll` addition
   - `packages/core/src/config.ts` — optional schema extension
   - `packages/core/src/database/migration.gen.ts` — auto-generated, regenerated
3. **Prefer EventV2 subscriptions** over hooks inside OpenCode functions. Subscriptions are additive and don't cause merge conflicts.
4. **Prefer SystemContext.Source registration** over system prompt manipulation. Sources compose naturally and are designed for extension.

### 1.5 Recommended Architecture Approach

```
┌──────────────────────────────────────────────────────────────┐
│                    LAYERED ARCHITECTURE                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │                  Dev-Intel TUI Plugin                │      │
│  │    api.slots.register("sidebar_content", ...)       │      │
│  └────────────────────────┬───────────────────────────┘      │
│                           │                                   │
│  ┌────────────────────────┴───────────────────────────┐      │
│  │              Dev-Intel Service Layer                 │      │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │      │
│  │  │ Memory   │ │ Observer │ │ SystemContext    │   │      │
│  │  │ Store    │ │ (events) │ │ Sources          │   │      │
│  │  └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │      │
│  └───────┼─────────────┼────────────────┼─────────────┘      │
│          │             │                │                     │
│  ┌───────┴─────────────┴────────────────┴─────────────┐      │
│  │              OpenCode Integration Layer              │      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │      │
│  │  │ SystemContext│  │ EventV2      │  │ Database │ │      │
│  │  │ Registry     │  │ Subscribe    │  │ (Drizzle)│ │      │
│  │  └──────────────┘  └──────────────┘  └──────────┘ │      │
│  └────────────────────────┬───────────────────────────┘      │
│                           │                                   │
│  ┌────────────────────────┴───────────────────────────┐      │
│  │                OpenCode Core                         │      │
│  │  SessionRunner │ ToolRegistry │ SessionV2 │ Config  │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Proposed Package Structure

### 2.1 Root Structure

```
packages/devintel/              # New monorepo workspace
├── package.json                # @opencode-ai/devintel
├── tsconfig.json               # extends root tsconfig
├── src/
│   ├── index.ts                # Public API: Layer, plugins, store
│   ├── layer.ts                # Effect Layer wiring
│   ├── schema.ts               # Shared Effect Schema definitions
│   │
│   ├── core/                   # Core primitives and base types
│   │   ├── types.ts            # Common types (MemoryID, Confidence, etc.)
│   │   ├── id.ts               # ID generation for Dev-Intel entities
│   │   └── errors.ts           # Tagged error types
│   │
│   ├── storage/                # Persistence layer
│   │   ├── schema.sql.ts       # Drizzle table definitions for all Dev-Intel tables
│   │   ├── db.ts               # Database service (wraps Database.Service)
│   │   ├── migration.ts        # Dev-Intel-specific migration
│   │   ├── project-store.ts    # Project CRUD
│   │   ├── memory-store.ts     # Memory CRUD (project/session/developer)
│   │   ├── activity-store.ts   # Activity log CRUD
│   │   └── workspace-store.ts  # Workspace snapshot CRUD
│   │
│   ├── projects/               # Project registry and discovery
│   │   ├── registry.ts         # Project registration/discovery service
│   │   ├── scanner.ts          # Filesystem scanner for .devintel directories
│   │   └── context.ts          # Project context aggregation
│   │
│   ├── sessions/               # Session tracking
│   │   ├── tracker.ts          # Active session tracking service
│   │   ├── store.ts            # Session metadata persistence
│   │   └── summary.ts          # Session summarization
│   │
│   ├── activity/               # Activity logging
│   │   ├── recorder.ts         # Activity event consumer
│   │   ├── timeline.ts         # Activity timeline builder
│   │   └── aggregator.ts       # Weekly/monthly activity summaries
│   │
│   ├── memory/                 # Memory system (SystemContext sources)
│   │   ├── project-memory.ts   # SystemContext.Source for project memory
│   │   ├── session-memory.ts   # SystemContext.Source for session memory
│   │   ├── developer-profile.ts# SystemContext.Source for developer profile
│   │   ├── loader.ts           # Loads relevant memory for a given context
│   │   └── inference.ts        # Learns patterns from observed activity
│   │
│   ├── embeddings/             # Semantic code intelligence
│   │   ├── provider.ts         # Embedding provider abstraction
│   │   ├── local.ts            # Local embedding model (e.g., all-MiniLM-L6-v2)
│   │   ├── index.ts            # Vector index (in-memory or HNSW)
│   │   └── search.ts           # Semantic search over stored embeddings
│   │
│   ├── workspace/              # Workspace awareness
│   │   ├── snapshot.ts         # Workspace state capture
│   │   └── diff.ts             # Workspace state diffing
│   │
│   ├── observer/               # EventV2 subscriptions
│   │   ├── session-observer.ts # Listens to SessionEvent.*
│   │   ├── tool-observer.ts    # Listens to Tool.* events
│   │   ├── prompt-observer.ts  # Listens to PromptLifecycle.* events
│   │   └── bridge.ts           # Bridges OpenCode events to Dev-Intel events
│   │
│   ├── resumes/                # Resume briefings
│   │   ├── generator.ts        # Generates context summaries
│   │   ├── template.md         # Resume briefing template
│   │   └── precedence.ts       # Determines what to show
│   │
│   └── tui/                    # TUI plugin (display layer)
│       ├── plugin.ts           # BuiltinTuiPlugin implementation
│       ├── memory-panel.tsx    # sidebar_content component
│       ├── resume-card.tsx     # home_bottom component
│       ├── status-bar.tsx      # home_footer component
│       ├── project-list.tsx    # Project registry display
│       └── activity-view.tsx   # Activity log viewer
└── .devintel/                  # Dev-Intel runtime data (per-project)
    ├── project.json
    └── ...
```

### 2.2 Package Responsibility Matrix

| Sub-package | Responsibility | Depends On |
|-------------|---------------|------------|
| `core/` | Base types, IDs, errors | Effect |
| `storage/` | All persistence via Drizzle + SQLite | `core/`, `@opencode-ai/core/database` |
| `projects/` | Project registration, discovery, context | `storage/`, `core/` |
| `sessions/` | Track active sessions, summary generation | `storage/`, `core/` |
| `activity/` | Consume events, build timelines | `observer/`, `storage/`, `core/` |
| `memory/` | SystemContext.Source implementations | `storage/`, `core/`, `@opencode-ai/core/system-context` |
| `embeddings/` | Vector search for code intelligence | `storage/`, `core/` |
| `workspace/` | Workspace state snapshots | `storage/`, `core/` |
| `observer/` | EventV2 subscription wiring | `core/`, `@opencode-ai/core/event` |
| `resumes/` | Resume briefing generation | `memory/`, `sessions/`, `activity/` |
| `tui/` | TUI plugin slot rendering | All above, `@opencode-ai/tui` |

### 2.3 Dependency Direction

```
Dev-Intel TUI
    │
    ▼
Dev-Intel Resumes ──► Dev-Intel Memory ──► Dev-Intel Storage
       │                    │
       ▼                    ▼
Dev-Intel Activity ────► Dev-Intel Observer
       │                    │
       ▼                    ▼
Dev-Intel Sessions    Dev-Intel Projects
       │                    │
       └────────┬───────────┘
                ▼
         Dev-Intel Core
                │
                ▼
         OpenCode APIs (EventV2, SystemContext, Database, TUI slots)
```

---

## 3. Storage Architecture

### 3.1 Storage Layer Decisions

| Data | Location | Format | Why |
|------|----------|--------|-----|
| **Project Registry** | SQLite (`devintel.db` or `opencode.db`) | Drizzle table `dev_intel_project` | Needs querying, joins with session data |
| **Project Memory** | `.devintel/` directory (files) | JSON files | Human-editable, version-controllable |
| **Session Memory** | SQLite | Drizzle table `dev_intel_memory` | Needs querying, filtering, confidence scoring |
| **Developer Profile** | Global SQLite / global config | Drizzle table + JSON file | Global across projects |
| **Activity Logs** | SQLite (append-only, periodic cleanup) | Drizzle table `dev_intel_activity` | Append-heavy, needs time-range queries |
| **Embeddings** | SQLite (store vectors as BLOB) + in-memory index | Drizzle table + HNSW in memory | Fast reads, periodic rebuild from SQLite |
| **Workspace Snapshots** | `.devintel/workspace/` (files) | JSON files | Rarely queried, point-in-time snapshots |
| **Task/Decision/Notes** | `.devintel/` directory (files) | JSON files | Human-editable, aligns with developer workflow |

### 3.2 Why SQLite vs File for Each

**SQLite (global, shared across projects):**
- Project Registry — needs joins with OpenCode's `project` table
- Session Memory — needs filtering by `project_id`, `session_id`, `type`, `confidence`
- Activity Logs — needs time-range queries, aggregation
- Embeddings — needs indexed reads
- Developer Profile — needs simple key-value lookup

**`.devintel/` files (per-project, human-editable):**
- Project Memory (structure, conventions, architecture notes) — developers should be able to edit these
- Tasks/Decisions/Notes — human-writable, version-controllable alongside code
- Workspace Snapshots — stored as point-in-time files

**In-memory only:**
- Current session activity buffer (flushed to DB periodically)
- Embedding index (rebuilt from SQLite on restart)
- Hot cache of recent memories (LRU)

### 3.3 Directory Layout

```
~/.local/share/opencode/
├── opencode.db               # OpenCode's existing database
├── devintel.db               # Dev-Intel's database (or same DB, separate tables)
│                              # Preferred: same DB, namespaced tables
│
~/.config/opencode/
└── devintel.json             # Dev-Intel global config (developer profile, preferences)

{project}/
├── .devintel/                 # Per-project Dev-Intel directory
│   ├── project.json           # Project registration metadata
│   ├── memory/                # Structured project memory
│   │   ├── architecture.json   # Architecture overview
│   │   ├── conventions.json    # Coding conventions
│   │   ├── glossary.json       # Project-specific terminology
│   │   └── decisions.json      # Architectural Decision Records
│   ├── tasks.json              # Active and historical tasks
│   ├── notes.json              # Free-form developer notes
│   └── workspace/              # Workspace snapshots
│       └── 2026-06-13T...json  # Timestamped snapshots
├── opencode.json              # May reference Dev-Intel
└── ...
```

### 3.4 Dev-Intel Database Tables

All in a single SQLite database (either the existing `opencode.db` or a separate `devintel.db`). Recommended: separate `devintel.db` to avoid migration conflicts with upstream OpenCode.

```sql
-- Project Registry
CREATE TABLE dev_intel_project (
  id TEXT PRIMARY KEY,
  opencode_project_id TEXT,            -- FK to project.id (nullable if unknown)
  worktree_path TEXT NOT NULL,         -- Absolute path to project root
  name TEXT NOT NULL,
  vcs_type TEXT DEFAULT 'git',
  vcs_remote TEXT,                     -- e.g., github.com/user/repo
  last_opened_at INTEGER,
  times_opened INTEGER DEFAULT 0,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

-- Project Memory (indexed snapshot of .devintel/memory/)
CREATE TABLE dev_intel_project_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dev_intel_project(id),
  domain TEXT NOT NULL,                -- "architecture" | "conventions" | "glossary" | "decisions"
  content_json TEXT NOT NULL,          -- JSON body
  checksum TEXT NOT NULL,              -- For detecting changes
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

-- General Memory Store
CREATE TABLE dev_intel_memory_entry (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dev_intel_project(id),
  session_id TEXT,                     -- NULL if project-level memory
  memory_type TEXT NOT NULL,           -- "project" | "session" | "developer" | "learned" | "observation"
  content TEXT NOT NULL,               -- Structured JSON
  source TEXT NOT NULL DEFAULT 'inferred', -- "explicit" | "inferred" | "analysis" | "observation"
  importance REAL DEFAULT 0.5,         -- 0.0 to 1.0
  access_count INTEGER DEFAULT 0,
  last_accessed_at INTEGER,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);
CREATE INDEX idx_mem_project ON dev_intel_memory_entry(project_id);
CREATE INDEX idx_mem_session ON dev_intel_memory_entry(session_id);
CREATE INDEX idx_mem_type ON dev_intel_memory_entry(memory_type);

-- Session Tracking
CREATE TABLE dev_intel_session (
  id TEXT PRIMARY KEY,
  opencode_session_id TEXT,            -- FK to session.id
  project_id TEXT REFERENCES dev_intel_project(id),
  branch_name TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  message_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  summary TEXT,                        -- Generated session summary
  task_description TEXT,               -- What was the user trying to do?
  resolved BOOLEAN DEFAULT 0,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

-- Activity Log
CREATE TABLE dev_intel_activity (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES dev_intel_project(id),
  session_id TEXT REFERENCES dev_intel_session(id),
  activity_type TEXT NOT NULL,          -- "file_read" | "file_write" | "tool_call" | "branch_change" | ...
  category TEXT NOT NULL,              -- "file" | "tool" | "git" | "session"
  detail_json TEXT NOT NULL,           -- Activity-specific data
  occurred_at INTEGER NOT NULL
);
CREATE INDEX idx_activity_project ON dev_intel_activity(project_id);
CREATE INDEX idx_activity_session ON dev_intel_activity(session_id);
CREATE INDEX idx_activity_time ON dev_intel_activity(occurred_at);
CREATE INDEX idx_activity_type ON dev_intel_activity(activity_type);

-- Developer Profile (global, a singleton)
CREATE TABLE dev_intel_developer_profile (
  key TEXT PRIMARY KEY,                -- e.g., "preferred_languages", "work_hours", "tools"
  value_json TEXT NOT NULL,
  time_updated INTEGER NOT NULL
);

-- Embedding Index
CREATE TABLE dev_intel_embedding (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,            -- "memory_entry" | "code_chunk" | "activity"
  source_id TEXT NOT NULL,              -- FK to the source table
  embedding BLOB,                       -- Float32 vector (up to 384-1536 dims)
  model_id TEXT NOT NULL,               -- Which model generated this
  content_snippet TEXT NOT NULL,        -- Original text for display
  project_id TEXT REFERENCES dev_intel_project(id),
  time_created INTEGER NOT NULL
);
CREATE INDEX idx_embedding_project ON dev_intel_embedding(project_id);
```

### 3.5 Database Connection Strategy

Dev-Intel should open its own SQLite connection (or use a separate database file). This prevents schema coupling with OpenCode's migration system.

```ts
// Option A: Separate devintel.db (recommended)
const db = drizzle(Bun.sqlite(path.join(Global.Path.data, "devintel.db")), { schema })

// Option B: Same opencode.db, namespaced tables
// Higher risk of migration conflicts. Only if Dev-Intel tables
// are added as a migration in the OpenCode migration chain.
```

---

## 4. Integration Points

### 4.1 Project Open

| Aspect | Detail |
|--------|--------|
| **Why useful** | Detect when a developer starts working on a project; load project memory; register in project registry |
| **OpenCode hook** | `InstanceState.make()` — `packages/opencode/src/effect/instance-state.ts` |
| **Risk** | **LOW** — Observing project load doesn't affect execution |
| **Strategy** | Register a Dev-Intel layer that runs during `InstanceState.make()`. The `InstanceState` is scoped per-directory via `ScopedCache`, so we get lifecycle events for free. |
| **Implementation** | In Dev-Intel layer's `init()`: detect project directory change, call `DevIntelProjects.register(directory)`, load project memory from `.devintel/` |
| **Alternative (safer)** | Use `EventV2.subscribe(SessionEvent.Session.Created)` as proxy for first use; project is implicitly registered when first session starts |
| **Recommendation** | Both: lazy registration on first session + explicit scan. |

### 4.2 Session Start

| Aspect | Detail |
|--------|--------|
| **Why useful** | Begin tracking activity for this session; preload session memory; set active project/branch |
| **OpenCode hook** | `SessionV2.prompt()` — `packages/core/src/session.ts` or `EventV2.subscribe(SessionEvent.PromptLifecycle.Admitted)` |
| **Risk** | **LOW** — Event subscription is additive |
| **Strategy** | Subscribe to `SessionEvent.PromptLifecycle.Admitted` via `EventV2.subscribe()`. On first admission for a session, create `dev_intel_session` row. |
| **Implementation** | In `packages/devintel/src/observer/session-observer.ts`: on `Admitted` event if no session row exists → create session, start activity buffer. |

### 4.3 Session End

| Aspect | Detail |
|--------|--------|
| **Why useful** | Generate session summary; consolidate learnings; close activity buffer |
| **OpenCode hook** | No explicit "session end" event exists. Best proxy: session idle timeout, or `SessionEvent.InterruptRequested`, or user closing the tab/TUI |
| **Risk** | **LOW** — Best-effort detection; session can persist forever |
| **Strategy** | Detect inactivity (no new prompts for N minutes) as session end. Also detect TUI shutdown. |
| **Implementation** | In session observer: track last activity time per session. After 5 minutes of inactivity, consider session ended, generate summary. |

### 4.4 Prompt Construction (Memory Injection)

| Aspect | Detail |
|--------|--------|
| **Why useful** | Inject project/session/developer memory into the LLM context before every provider turn |
| **OpenCode hook** | **`SystemContextRegistry.register()`** — `packages/core/src/system-context/registry.ts` |
| **Risk** | **LOW** — This is the designed extension point for context injection |
| **Strategy** | Create `SystemContext.Source` instances for each memory type. Register them during Dev-Intel layer initialization. The V2 runner automatically loads them via `loadSystemContext()`. |
| **Implementation** | In `packages/devintel/src/memory/project-memory.ts`: |
| | 1. Define a `SystemContext.Source` with key `"dev-intel/project-memory"` |
| | 2. `load()` reads from `.devintel/memory/*.json` or `dev_intel_memory_entry` table |
| | 3. `baseline()` renders markdown for the LLM |
| | 4. `update()` computes diff for efficient context refreshes |
| | 5. Register via `systemContextRegistry.register(source)` at layer setup |
| **Token budget** | Each memory source should target < 500 tokens of rendered baseline. Summary context should target < 1000 tokens total. |

### 4.5 Tool Execution Start

| Aspect | Detail |
|--------|--------|
| **Why useful** | Record which tools are being called, with what inputs. Builds activity log for timeline. Detects codebase changes (file writes, edits). |
| **OpenCode hook** | `EventV2.subscribe(SessionEvent.Tool.Called)` |
| **Risk** | **LOW** — Event subscription is additive |
| **Strategy** | Subscribe to `SessionEvent.Tool.Called`. Extract tool name, input summary, session ID. Write to `dev_intel_activity` table. |
| **Implementation** | In `packages/devintel/src/observer/tool-observer.ts`: on `Tool.Called` → insert activity row with type `"tool_call"`, detail `{ name, inputSummary }`. |

### 4.6 Tool Execution End

| Aspect | Detail |
|--------|--------|
| **Why useful** | Record tool results and side effects. Detect file changes (for workspace snapshots). Capture errors for learning. |
| **OpenCode hook** | `EventV2.subscribe(SessionEvent.Tool.Success)` and `SessionEvent.Tool.Failed` |
| **Risk** | **LOW** — Event subscription is additive |
| **Strategy** | Subscribe to both success and failed events. Update the corresponding activity row with outcome. For file-writing tools (write, edit, apply_patch), trigger a workspace snapshot. |
| **Implementation** | In `packages/devintel/src/observer/tool-observer.ts`: |
| | - On `Tool.Success` → update activity `detail.success = true`, capture output summary |
| | - On `Tool.Failed` → update activity `detail.success = false`, capture error |

### 4.7 Conversation Persistence

| Aspect | Detail |
|--------|--------|
| **Why useful** | Index OpenCode sessions in Dev-Intel for cross-session queries and resume briefings |
| **OpenCode hook** | `EventV2.subscribe(SessionEvent.*)` + `SessionStore` reads |
| **Risk** | **LOW** — Read-only on OpenCode data; write-only on Dev-Intel data |
| **Strategy** | Subscribe to all session events. Maintain a `dev_intel_session` table mirror with Dev-Intel-specific fields (branch, task, resolved). |
| **Implementation** | In session observer: on each session event, upsert `dev_intel_session` metadata. On new messages, increment `message_count`. |

### 4.8 UI Rendering

| Aspect | Detail |
|--------|--------|
| **Why useful** | Show project memory, session context, resume briefings directly in the TUI |
| **OpenCode hook** | TUI plugin slots: `sidebar_content`, `home_bottom`, `home_footer` |
| **Risk** | **LOW** — Plugin slot system is designed for this |
| **Strategy** | Create a `BuiltinTuiPlugin` that registers slot handlers. Follow the pattern in `packages/tui/src/feature-plugins/sidebar/context.tsx`. |
| **Implementation** | In `packages/devintel/src/tui/plugin.ts`: |
| | - `api.slots.register("sidebar_content")` → `DevIntelMemoryPanel` showing active memory entries |
| | - `api.slots.register("home_bottom")` → `DevIntelResumeCard` showing session resume briefing |
| | - `api.slots.register("home_footer")` → `DevIntelStatusBar` showing memory count, freshness |
| | Register in `packages/tui/src/feature-plugins/builtins.ts` |

### 4.9 Integration Point Summary

| Integration | Hook | File | Safety | Phase |
|-------------|------|------|--------|-------|
| Project registry | Observe session start events | `observer/session-observer.ts` | SAFE | 1 |
| Project memory load | `SystemContextRegistry.register()` | `memory/project-memory.ts` | SAFE | 2 |
| Session tracking | `EventV2.subscribe(PromptLifecycle.Admitted)` | `observer/session-observer.ts` | SAFE | 3 |
| Resume briefings | TUI slot `home_bottom` | `tui/resume-card.tsx` | SAFE | 4 |
| Activity logging | `EventV2.subscribe(Tool.*)` | `observer/tool-observer.ts` | SAFE | 5 |
| Semantic search | New Drizzle table + embedding index | `embeddings/` | SAFE | 6 |
| OpenCode memory inject | `SystemContextRegistry.register()` | `memory/*-memory.ts` | SAFE | 7 |

---

## 5. Phase-by-Phase Implementation Plan

### Phase 1: Project Registry

**Purpose:** Track which repositories the developer works on. Establish the foundation for all per-project intelligence.

**Dependencies:** None (standalone)

**Expected Deliverables:**
- `packages/devintel/src/storage/schema.sql.ts` — `dev_intel_project` table
- `packages/devintel/src/storage/db.ts` — Database connection
- `packages/devintel/src/storage/project-store.ts` — Project CRUD
- `packages/devintel/src/projects/registry.ts` — Registration service
- `packages/devintel/src/projects/scanner.ts` — Scan for `.devintel/` dirs
- `packages/devintel/src/tui/plugin.ts` — TUI plugin bootstrap
- `packages/devintel/src/tui/project-list.tsx` — Project list in sidebar
- `packages/devintel/src/layer.ts` — Effect Layer
- Migration: `20260614_dev_intel_project.sql.ts`

**Likely Files Affected:**
- `packages/opencode/src/effect/app-runtime.ts` — Add `DevIntel.layer`
- `packages/tui/src/feature-plugins/builtins.ts` — Register Dev-Intel TUI plugin
- All other files are new in `packages/devintel/`

**Required Extension Points:**
- `EventV2.subscribe(SessionEvent.Session.Created)` — Detect first session → implicitly register project
- TUI slot `sidebar_content` — Show project list

**Risks:**
- **Low** — No interaction with OpenCode's core execution path
- New database file requires directory existence check

**Success Criteria:**
- Dev-Intel automatically discovers projects when sessions start in them
- Project list appears in TUI sidebar
- Project registry persists across restarts

---

### Phase 2: Project Memory

**Purpose:** Create persistent, human-editable project memory that survives restarts.

**Dependencies:** Phase 1 (Project Registry)

**Expected Deliverables:**
- `.devintel/` directory creation on project registration
- `.devintel/project.json` — Project metadata
- `.devintel/memory/architecture.json` — Architecture overview
- `.devintel/memory/conventions.json` — Coding conventions
- `.devintel/memory/decisions.json` — ADRs
- `.devintel/memory/glossary.json` — Project terminology
- `.devintel/tasks.json` — Task tracking
- `.devintel/notes.json` — Free-form notes
- `packages/devintel/src/projects/context.ts` — Context aggregation from .devintel files
- `packages/devintel/src/storage/memory-store.ts` — SQLite memory index

**Likely Files Affected:**
- `packages/devintel/src/storage/schema.sql.ts` — Add `dev_intel_memory_entry` table
- `packages/devintel/src/memory/loader.ts` — Load memory from .devintel

**Required Extension Points:**
- None yet — this phase is purely about filesystem persistence

**Risks:**
- **Low** — No integration with OpenCode execution
- Need to handle concurrent writes to .devintel files (use Effect locks)

**Success Criteria:**
- Creating `conventions.json` in `.devintel/memory/` persists across restarts
- Content is readable by both humans and Dev-Intel
- Multiple projects have independent `.devintel/` directories

---

### Phase 3: Session Tracking

**Purpose:** Track what the developer is currently working on.

**Dependencies:** Phase 1 (Project Registry)

**Expected Deliverables:**
- `packages/devintel/src/observer/session-observer.ts` — Event subscriptions
- `packages/devintel/src/sessions/tracker.ts` — Active session tracking
- `packages/devintel/src/sessions/store.ts` — Session persistence
- `packages/devintel/src/storage/schema.sql.ts` — `dev_intel_session` table
- `packages/devintel/src/tui/resume-card.tsx` — Show active session info

**Likely Files Affected:**
- `packages/devintel/src/layer.ts` — Wire observer
- `packages/devintel/src/tui/plugin.ts` — Wire resume card component

**Required Extension Points:**
- `EventV2.subscribe(SessionEvent.PromptLifecycle.Admitted)` — Session start
- `EventV2.subscribe(SessionEvent.Session.*)` — Session lifecycle
- TUI slot `home_bottom` — Active session display

**Risks:**
- **Low** — Event subscriptions don't affect execution

**Success Criteria:**
- Active session displays project, branch, recent files
- Session metadata persists in SQLite
- Session history is queryable

---

### Phase 4: Resume Briefings

**Purpose:** Restore developer context instantly on app start.

**Dependencies:** Phase 2 + Phase 3

**Expected Deliverables:**
- `packages/devintel/src/resumes/generator.ts` — Context summary generation
- `packages/devintel/src/resumes/template.md` — Markdown template
- `packages/devintel/src/resumes/precedence.ts` — Priority logic
- `packages/devintel/src/sessions/summary.ts` — Session summarization
- `packages/devintel/src/memory/loader.ts` — Relevance-based memory loading
- Updated `packages/devintel/src/tui/resume-card.tsx` — Full resume UI

**Likely Files Affected:**
- `packages/devintel/src/memory/project-memory.ts` — Load for resume context
- `packages/devintel/src/memory/session-memory.ts` — Load last session context

**Required Extension Points:**
- `SystemContextRegistry.register()` — Inject resume context as a SystemContext source
- TUI slot `home_bottom` — Display resume briefing

**Risks:**
- **Medium** — Resume briefing could generate large context; need token budget management

**Success Criteria:**
- App restart shows "Resume: you were working on X in project Y, on branch Z"
- Unfinished tasks are detected and shown
- Recent files are listed

---

### Phase 5: Activity Logging

**Purpose:** Build a historical record of development activity.

**Dependencies:** Phase 3 (Session Tracking)

**Expected Deliverables:**
- `packages/devintel/src/observer/tool-observer.ts` — Tool event subscriptions
- `packages/devintel/src/observer/prompt-observer.ts` — Prompt event subscriptions
- `packages/devintel/src/activity/recorder.ts` — Activity event consumer
- `packages/devintel/src/activity/timeline.ts` — Timeline builder
- `packages/devintel/src/activity/aggregator.ts` — Weekly/monthly summaries
- `packages/devintel/src/storage/schema.sql.ts` — `dev_intel_activity` table
- `packages/devintel/src/tui/activity-view.tsx` — Activity log UI

**Likely Files Affected:**
- `packages/devintel/src/layer.ts` — Wire tool/prompt observers
- `packages/devintel/src/tui/plugin.ts` — Wire activity view

**Required Extension Points:**
- `EventV2.subscribe(SessionEvent.Tool.Called/Success/Failed)` — Tool activity
- `EventV2.subscribe(SessionEvent.PromptLifecycle.Admitted/Promoted)` — Prompt activity
- TUI slot `sidebar_content` or new panel for activity timeline

**Risks:**
- **Medium** — Activity table can grow unbounded; need retention policy (e.g., 90 days)
- **Low** — Event subscription is additive

**Success Criteria:**
- Every tool call is recorded in activity log
- Activity timeline is viewable in TUI
- Old activity is automatically pruned after retention period

---

### Phase 6: Semantic Search

**Purpose:** Enable semantic understanding and retrieval of code and project context.

**Dependencies:** Phase 5 (Activity Logging), Phase 2 (Project Memory)

**Expected Deliverables:**
- `packages/devintel/src/embeddings/provider.ts` — Embedding abstraction
- `packages/devintel/src/embeddings/local.ts` — Local model integration
- `packages/devintel/src/embeddings/index.ts` — In-memory vector index
- `packages/devintel/src/embeddings/search.ts` — Search interface
- `packages/devintel/src/storage/schema.sql.ts` — `dev_intel_embedding` table
- Chunking and indexing of project files
- Chunking and indexing of project memory
- Chunking and indexing of activity logs

**Likely Files Affected:**
- `packages/devintel/src/memory/loader.ts` — Use semantic search for memory retrieval
- `packages/devintel/src/projects/context.ts` — Index project codebase

**Required Extension Points:**
- None directly (embeddings are internal to Dev-Intel)
- May later connect to `SystemContext.Source` load function for semantic retrieval

**Risks:**
- **Performance** — Embedding generation can be slow on large codebases; needs background job with progress
- **Storage** — Embedding vectors are large; need efficient BLOB storage
- **Model choice** — Must work offline; ONNX runtime or transformer.js for local embeddings

**Success Criteria:**
- Query "find where we handle authentication" returns relevant file paths
- Query "what was the discussion about caching?" returns relevant session context
- Embeddings survive restarts (rebuilt from SQLite)
- Index time < 30 seconds for a medium-sized project (50K LOC)

---

### Phase 7: OpenCode Memory Integration

**Purpose:** Inject Dev-Intel memory directly into OpenCode's LLM context.

**Dependencies:** Phase 6 (Semantic Search), Phase 2 (Project Memory), Phase 3 (Session Tracking)

**Expected Deliverables:**
- `packages/devintel/src/memory/project-memory.ts` — `SystemContext.Source` for project memory
- `packages/devintel/src/memory/session-memory.ts` — `SystemContext.Source` for session context
- `packages/devintel/src/memory/developer-profile.ts` — `SystemContext.Source` for developer preferences
- `packages/devintel/src/memory/inference.ts` — Learn patterns from observed activity
- Integration test verifying context appears in LLM request

**Likely Files Affected:**
- `packages/devintel/src/layer.ts` — Register SystemContext sources
- `packages/devintel/src/memory/loader.ts` — Use semantic search to select relevant memories

**Required Extension Points:**
- **`SystemContextRegistry.register()`** — The primary hook. Register sources that are automatically loaded by `SessionRunner` before each LLM turn.

**Risks:**
- **HIGH** — Context is the most sensitive part of the LLM request. Too much context degrades quality. Wrong context confuses the model. Need careful:
  - **Token budgeting**: Each source < 500 tokens, total < 2000 tokens for Dev-Intel
  - **Relevance filtering**: Only inject memory if relevance exceeds threshold
  - **A/B testing**: Compare session quality with and without Dev-Intel context
- **Upstream compatibility**: If upstream changes SystemContext API, Dev-Intel sources must be updated

**Success Criteria:**
- Project memory appears in `LLM.request()` system context
- Session memory includes recent tool usage and decisions
- Developer preferences (language, style) are reflected in model behavior
- Memory injection adds < 500ms to session startup time
- Token overhead is < 2000 tokens per provider turn

---

## 6. Event Architecture

### 6.1 Event Definitions

Dev-Intel defines its own event types (separate from OpenCode's `SessionEvent`). These are internal to Dev-Intel but inspired by OpenCode's event-sourcing pattern.

```typescript
// Dev-Intel Internal Events (not OpenCode EventV2)
// These are emitted and consumed within the Dev-Intel service layer.

type DevIntelEvent =
  // Project lifecycle
  | { type: "project_registered"; projectID: string; worktree: string }
  | { type: "project_opened"; projectID: string }
  | { type: "project_closed"; projectID: string }
  | { type: "project_memory_updated"; projectID: string; domain: string }

  // Session lifecycle
  | { type: "session_started"; sessionID: string; projectID: string; branch: string }
  | { type: "session_ended"; sessionID: string; summary: string }
  | { type: "session_resumed"; sessionID: string; previousEnd: number }

  // Activity
  | { type: "tool_invoked"; sessionID: string; toolName: string; input: unknown }
  | { type: "tool_completed"; sessionID: string; toolName: string; success: boolean; output?: unknown }
  | { type: "message_sent"; sessionID: string; messageType: "user" | "assistant" }
  | { type: "branch_changed"; projectID: string; oldBranch: string; newBranch: string }
  | { type: "file_modified"; projectID: string; filePath: string; action: "read" | "write" | "edit" | "delete" }

  // Memory
  | { type: "memory_created"; memoryID: string; projectID: string; memoryType: string }
  | { type: "memory_accessed"; memoryID: string; accessCount: number }

  // Intelligence
  | { type: "insight_derived"; projectID: string; insight: string; confidence: number }
  | { type: "pattern_detected"; projectID: string; pattern: string; evidence: string[] }
```

### 6.2 Event Producers and Consumers

```
┌──────────────────────────────────────────────────────────────────┐
│                       EVENT FLOW MAP                             │
└──────────────────────────────────────────────────────────────────┘

OpenCode EventV2                 Dev-Intel Observer           Dev-Intel Consumers
─────────────────                ─────────────────────       ─────────────────────

SessionEvent.PromptLifecycle     session-observer.ts
  .Admitted                         │
  .Promoted                         ├── emit session_started ─────► Session Tracker
                                    ├── emit project_opened ─────► Project Registry
                                    └── emit message_sent  ──────► Activity Recorder

SessionEvent.Tool.Called          tool-observer.ts
                                    ├── emit tool_invoked  ───────► Activity Recorder
                                    └── record tool input  ───────► Memory Inference

SessionEvent.Tool.Success         tool-observer.ts
  .Failed                           ├── emit tool_completed ──────► Activity Recorder
                                    └── detect file changes ──────► Workspace Snapshot

SessionEvent.Text.*               prompt-observer.ts
                                    ├── emit message_sent  ───────► Session Summary
                                    └── extract entities  ───────► Memory Inference

Filesystem Watcher                workspace/diff.ts
  (file changes)                     ├── emit file_modified ──────► Activity Recorder
                                     └── trigger snapshot  ───────► Workspace Snapshot

Git integration                    (future)
  (branch changes)                   └── emit branch_changed ─────► Session Tracker

Internal Timers                    resumes/generator.ts
  (startup)                           └── generate briefing  ─────► TUI Plugin

Internal Timers                    activity/aggregator.ts
  (daily/weekly)                       └── emit insight_derived ──► Memory Store
```

### 6.3 Event Data Payloads

```typescript
// Detailed payload shapes for key events

// Session event from OpenCode bridge
interface SessionStartedPayload {
  sessionID: string
  opencodeSessionID: string
  projectID: string
  projectWorktree: string
  branchName: string
  timestamp: number
}

// Tool event from OpenCode bridge
interface ToolInvokedPayload {
  sessionID: string
  toolName: string
  inputSummary: string          // Truncated/redacted input
  inputSizeBytes: number
  timestamp: number
}

interface ToolCompletedPayload {
  sessionID: string
  toolName: string
  success: boolean
  outputSummary?: string        // Truncated/redacted output
  errorMessage?: string
  durationMs: number
  modifiedFiles?: string[]      // Files this tool changed
  timestamp: number
}

// Memory event
interface MemoryCreatedPayload {
  memoryID: string
  projectID: string
  sessionID?: string
  memoryType: "project" | "session" | "developer" | "learned" | "observation"
  content: Record<string, unknown>
  source: "explicit" | "inferred" | "analysis" | "observation"
  importance: number
}

// Insight event
interface InsightDerivedPayload {
  projectID: string
  insight: string              // Natural language insight
  confidence: number           // 0.0 to 1.0
  evidence: string[]           // Supporting observations
  category: "pattern" | "convention" | "preference" | "decision"
}
```

---

## 7. Data Models

### 7.1 Project

```typescript
interface Project {
  id: string                    // dev_intel_ prefix, ULID-based
  opencodeProjectID?: string    // FK to OpenCode's project.id
  worktreePath: string          // Absolute path to project root
  name: string                  // Derived from directory name or .devintel/project.json
  vcsType: "git" | "hg" | "svn" | "none"
  vcsRemote?: string            // e.g., "github.com/user/repo"
  lastOpenedAt: number          // Unix ms timestamp
  timesOpened: number
  memoryDomains: string[]       // From .devintel/memory/ directory listing
  hasDevIntel: boolean          // Has .devintel directory?
  createdAt: number
  updatedAt: number
}
```

### 7.2 Session

```typescript
interface Session {
  id: string                    // dev_intel_ prefix
  opencodeSessionID?: string    // FK to OpenCode session.id
  projectID: string             // FK to Project.id
  branchName: string            // Git branch at session start
  startedAt: number
  endedAt?: number
  messageCount: number
  toolCallCount: number

  // Derived
  summary?: string              // Generated session summary
  taskDescription?: string      // "What was the user trying to accomplish?"
  resolved: boolean             // Was the task completed?

  // Context
  recentFiles: string[]         // Files touched during session
  decisions: string[]           // Key decisions made
  keyInsights: string[]         // Important discoveries

  createdAt: number
  updatedAt: number
}
```

### 7.3 Task

```typescript
interface Task {
  id: string                    // dev_intel_task_ prefix
  projectID: string
  sessionID?: string            // Session where this task was identified
  parentTaskID?: string         // For subtask nesting

  title: string                 // Short description
  description: string           // Full description (may be AI-generated)
  status: "open" | "in_progress" | "done" | "cancelled" | "blocked"
  priority: "low" | "medium" | "high" | "critical"

  // Context
  branch: string                // Branch related to this task
  relatedFiles: string[]        // Files involved
  relatedDecisions: string[]    // Decision IDs from decisions.json

  // Tracking
  startedAt?: number
  completedAt?: number
  timeSpentMs?: number
  tags: string[]

  createdAt: number
  updatedAt: number
}
```

### 7.4 Decision

```typescript
interface Decision {
  id: string                    // ADR-001 or dev_intel_decision_ prefix
  projectID: string
  title: string                 // "Use Effect for dependency injection"
  context: string               // What prompted this decision
  decision: string              // What was decided
  consequences: string          // Positive and negative consequences
  status: "proposed" | "accepted" | "deprecated" | "superseded"

  // Metadata
  author: string                // Who made it
  date: number                  // When
  relatedFiles: string[]        // Files affected
  supersededBy?: string         // ID of decision that replaced this one
  tags: string[]
}
```

### 7.5 Activity

```typescript
interface Activity {
  id: string                    // dev_intel_act_ prefix
  projectID: string
  sessionID: string

  type: "file_read" | "file_write" | "file_edit" | "file_delete"
      | "tool_call" | "shell_command" | "web_search" | "web_fetch"
      | "branch_change" | "git_commit" | "git_checkout"
      | "session_start" | "session_end"
      | "prompt_sent" | "response_received"

  // Common
  summary: string               // Human-readable one-liner
  durationMs?: number

  // Type-specific
  filePath?: string             // For file operations
  toolName?: string             // For tool calls
  command?: string              // For shell commands
  branch?: string               // For branch changes
  success?: boolean

  occurredAt: number            // Unix ms
}
```

### 7.6 Workspace

```typescript
interface WorkspaceSnapshot {
  id: string                    // dev_intel_ws_ prefix
  projectID: string

  // Git state
  branch: string
  commitSHA: string
  hasUncommittedChanges: boolean
  changedFiles: string[]

  // OpenCode state
  activeSessionID?: string
  openFiles: string[]

  // Context
  recentTasks: string[]         // Last 3 task descriptions
  currentTask?: string

  createdAt: number
}
```

### 7.7 Developer Profile

```typescript
interface DeveloperProfile {
  // Identity
  displayName?: string
  preferredLanguages: string[]

  // Preferences
  codingStyle?: "concise" | "verbose" | "detailed"
  testStyle?: "tdd" | "post-hoc" | "minimal"
  commitStyle?: "conventional" | "descriptive" | "minimal"
  commentStyle?: "extensive" | "minimal" | "none"

  // Work patterns
  activeHours: [number, number][]   // e.g., [[9, 12], [14, 18]]
  activeDays: number[]              // 0=Sun, 1=Mon, ...
  typicalSessionDuration: number    // minutes, learned

  // Tools
  frequentTools: Array<{ name: string; count: number }>
  preferredShell?: string
  preferredEditor?: string
  mcpServersUsed: string[]

  // Learned
  commonPatterns: string[]
  recentTopics: string[]           // Weekly changing topics

  updatedAt: number
}
```

### 7.8 Project Context (SystemContext Source Payload)

```typescript
// This is what gets rendered into the LLM system prompt
interface ProjectContextForLLM {
  architecture: string              // Text summary of architecture
  conventions: Array<{
    pattern: string
    description: string
  }>
  glossary: Array<{
    term: string
    definition: string
  }>
  recentChanges: string[]           // Last 5 significant findings
  activeTask?: {
    title: string
    branch: string
    relatedFiles: string[]
  }
  developerPreferences?: {
    style: string
    languages: string[]
  }
}

// Rendered as markdown for the system prompt:
// ## Project Intelligence
//
// ### Architecture
// This project uses Effect v4 with Drizzle ORM...
//
// ### Conventions
// - Use Effect.gen for composition
// - Avoid else statements, prefer early returns
// ...
```

---

## 8. Risk Analysis

### 8.1 Architectural Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **OpenCode V1/V2 migration completes, changing session architecture** | HIGH | Dev-Intel hooks into V2 patterns may need updates | Target V2 from day one; avoid V1 hooks entirely |
| **SystemContext algebra changes upstream** | MEDIUM | Dev-Intel memory sources need rework | Isolate SystemContext source registration behind Dev-Intel's own abstraction layer |
| **EventV2 API changes** | LOW | Observer subscriptions break | Use `EventV2.subscribe()` — the stable public API |
| **TUI plugin slot system changes** | MEDIUM | Sidebar/resume UI breaks | Keep UI components thin; TUI slot registration is simple |

### 8.2 Performance Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Memory injection adds latency to session startup** | MEDIUM | Worse developer experience | Load memory asynchronously; inject in a background fiber before the first prompt response |
| **Embedding generation blocks the main thread** | HIGH | UI freezes during indexing | Use background jobs (OpenCode's `BackgroundJob` service); chunk large codebases; incremental indexing |
| **Activity logging writes contend with SQLite** | LOW | Minor write latency | Batch activity writes (buffer in memory, flush every 5 seconds) |
| **Large .devintel directories slow down project open** | LOW | Startup delay | Async loading; show loading state in TUI |

### 8.3 Storage Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Activity table grows unbounded** | HIGH | Disk usage, slow queries | Default 90-day retention; configurable; automatic pruning job |
| **Embedding vectors consume significant storage** | MEDIUM | Disk usage | Compress vectors (scalar quantization); offer configurable model size |
| **.devintel files conflict with developer workflows** | LOW | Developer annoyance | Make files human-readable and optional; never required for OpenCode functionality |
| **SQLite WAL file grows with frequent writes** | LOW | Disk usage | Periodic checkpointing (already handled by OpenCode's SQLite pragmas) |

### 8.4 Prompt Context Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Memory injection pollutes the LLM context window** | MEDIUM | Worse model responses | Strict token budget (< 2000 tokens total); relevance filtering with semantic search |
| **Stale or incorrect memory misleads the model** | MEDIUM | Incorrect code suggestions | Confidence scoring (0-1); only inject memories with confidence > 0.7; show "I think..." framing |
| **Too much context causes model to ignore instructions** | LOW | Degraded agent performance | System Context baseline + diff pattern naturally limits context growth |
| **Developer profile changes are not reflected** | LOW | Stale preferences | Profile has `updatedAt`; SystemContext's `update()` computes diff for efficient refresh |

### 8.5 Upstream Compatibility Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **OpenCode merges from upstream conflict with Dev-Intel changes** | MEDIUM | Painful merge resolution | **Keep Dev-Intel changes minimal:** only `app-runtime.ts` (+1 line), new database migration, new TUI plugin registration. All other code is in `packages/devintel/` which upstream doesn't touch. |
| **OpenCode changes SystemContext registration API** | MEDIUM | Dev-Intel sources need rewrite | Monitor upstream changes; SystemContext is part of `@opencode-ai/core` which has semver |
| **OpenCode changes TUI plugin API** | LOW | TUI plugin needs update | Keep plugin simple; TUI plugin API is stable |

### 8.6 Maintenance Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Embedding model becomes unavailable** | LOW | Semantic search broken | Support multiple providers; local-first with ONNX; graceful degradation to keyword search |
| **.devintel format drifts from codebase** | MEDIUM | Stale project context | Regular refresh prompts; integrate with git hooks to update on push |
| **Developer profile becomes outdated** | MEDIUM | Irrelevant preferences | Continuous learning from tool usage; prompt user periodically to review |

---

## 9. Recommended MVP Scope

### 9.1 MVP = Phase 1 + Phase 2 + Phase 3

Based on the repository architecture, the smallest valuable MVP is:

| Phase | Effort | Value | Risk | Include? |
|-------|--------|-------|------|----------|
| **1 Project Registry** | Low | Medium | Low | **YES** — Foundation |
| **2 Project Memory** | Medium | High | Low | **YES** — Core value |
| **3 Session Tracking** | Medium | High | Low | **YES** — Core value |
| **4 Resume Briefings** | High | Medium | Medium | **NO** — Depends on session summarization quality |
| **5 Activity Logging** | Medium | Medium | Medium | **NO** — Value is retrospective; build later |
| **6 Semantic Search** | High | High | High | **NO** — Expensive and risky; build after MVP validates |
| **7 Memory Injection** | Medium | High | High | **NO** — Too risky for MVP; context pollution could ruin UX |

### 9.2 Why Stop at Phase 3

**Phase 4 (Resume Briefings)** requires session summarization, which is essentially an LLM feature. The quality bar is high, and bad summaries undermine trust. This is better as a post-MVP enhancement.

**Phase 5 (Activity Logging)** provides retrospective value but doesn't directly improve the user's current experience. It can be added without breaking anything.

**Phase 6 (Semantic Search)** is expensive to build (embeddings, indexing, search UI) and introduces performance risks. The MVP should validate the memory concept without the complexity of vector search.

**Phase 7 (Memory Injection)** is the most impactful but also the most dangerous. Injecting wrong context into LLM prompts will make the agent worse, not better. This must be built on top of a proven memory system (MVP validates this).

### 9.3 MVP Deliverables

```
Phase 1 + Phase 2 + Phase 3 = MVP

What you get:
- Dev-Intel knows all projects (auto-discovered)
- Each project has .devintel/ with editable memory files
- Each session is tracked with branch, files, duration
- TUI sidebar shows project list and memory status
- All data survives restarts (SQLite + files)
```

### 9.4 MVP Implementation Order

1. **Package skeleton** — `packages/devintel/` with `package.json`, `tsconfig.json`, empty `src/`
2. **Storage foundation** — Database connection, `dev_intel_project` table, migration
3. **Project registry** — Auto-discover from session events, show in TUI
4. **.devintel directory** — Create on project registration, seed with templates
5. **Project memory** — Read `.devintel/memory/*.json`, display in TUI
6. **Session tracking** — Subscribe to session events, persist `dev_intel_session`
7. **Wire into OpenCode** — Add layer to `app-runtime.ts`, register TUI plugin
8. **Integration tests** — Verify all data survives restart, TUI shows correctly

### 9.5 What to Avoid Entirely in MVP

- DO NOT inject any Dev-Intel data into LLM prompts (no SystemContext sources)
- DO NOT attempt session summarization (requires LLM calls)
- DO NOT build embeddings or semantic search
- DO NOT modify OpenCode's session/message storage
- DO NOT add background jobs that could interfere with session execution

---

## 10. Future Opportunities

### 10.1 After MVP (Phases 4-7)

Once baseline memory is proven:

- **Resume Briefings** — "Welcome back. Yesterday you were working on X. Key decisions: Y, Z."
- **Activity Logging** — Full timeline of development activity, searchable, filterable
- **Semantic Search** — "Find the PR discussion about the caching layer"
- **Memory Injection** — Dev-Intel context automatically appears in every LLM request

### 10.2 Workspace Snapshots (Phase 8)

Periodically capture the full workspace state:
- Open files
- Terminal history
- Browser tabs (if integration exists)
- Window layout

Enables perfect context restoration after any interruption.

### 10.3 Developer Memory (Phase 9)

Learn and remember across all projects:
- Preferred coding style
- Frequently used libraries
- Personal conventions
- Work patterns (productive hours, common tasks)

### 10.4 Cross-Project Intelligence (Phase 10)

Connect knowledge across the developer's entire project ecosystem:
- Shared libraries between projects
- Pattern reuse
- Cross-project dependency chains
- "You solved this same problem in project B"

### 10.5 Developer Journal (Phase 11)

Automatic daily/weekly summaries of:
- What was accomplished
- Key decisions made
- Problems encountered
- Patterns discovered

### 10.6 Proactive Intelligence (Phase 12)

Dev-Intel suggests actions before being asked:
- "Your tests haven't been run since you changed the API"
- "You left a TODO on line 42 — would you like to address it?"
- "The convention you're using was deprecated in favor of X"
- "You've been working on this task for 3 hours — take a break?"

### 10.7 Developer Analytics (Phase 13)

Long-term analytics:
- Productivity patterns
- Tool usage frequency
- Time spent per project
- Personal velocity metrics

### 10.8 Jarvis Layer (Phase 14)

The ultimate vision from `DEVINTEL_VISION.md`:
- "Resume what I was doing yesterday" — full context restoration
- Persistent awareness across days, weeks, months
- True developer companion that understands context implicitly

---

## Appendix A: Files to Create/Modify Summary

### New Files (all in `packages/devintel/`)

Approximately 35-40 new files covering the full architecture.

### Modified Files (in OpenCode packages)

| File | Change | Risk |
|------|--------|------|
| `packages/opencode/src/effect/app-runtime.ts` | Add `DevIntel.layer` to `Layer.mergeAll` (1 line) | **LOW** |
| `packages/opencode/package.json` | Add `@opencode-ai/devintel` to workspace catalog (1 line) | **LOW** |
| `packages/tui/src/feature-plugins/builtins.ts` | Register Dev-Intel TUI plugin (1 line) | **LOW** |
| `packages/core/src/database/migration.gen.ts` | Auto-regenerated after adding migration (auto) | **LOW** |

3 lines of code changed in the entire OpenCode codebase. Everything else is in `packages/devintel/`.

### Files NEVER to Touch

| File | Reason |
|------|--------|
| `packages/core/src/session/runner/llm.ts` | Critical path; use SystemContext instead |
| `packages/core/src/event.ts` | Core infrastructure; use its APIs |
| `packages/core/src/session/input.ts` | Core session logic |
| `packages/core/src/session/projector.ts` | Core projection pipeline |
| `packages/core/src/session/context-epoch.ts` | Core context management |
| `packages/opencode/src/session/prompt.ts` | V1 legacy, being replaced |
| `packages/opencode/src/session/processor.ts` | V1 legacy, being replaced |
| `packages/core/src/database/migration.ts` | Migration infrastructure; add migrations |
| `packages/core/src/database/schema.gen.ts` | Auto-generated |
| `packages/core/src/database/migration.gen.ts` | Auto-generated |

---

## Appendix B: Integration Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     DEV-INTEL INTEGRATION ARCHITECTURE                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    TUI Layer (packages/tui)                         │  │
│  │                                                                     │  │
│  │  ┌─────────────────────┐  ┌──────────────────┐  ┌───────────────┐  │  │
│  │  │ sidebar_content     │  │ home_bottom      │  │ home_footer   │  │  │
│  │  │ MemoryPanel.tsx     │  │ ResumeCard.tsx   │  │ StatusBar.tsx │  │  │
│  │  └─────────┬───────────┘  └────────┬─────────┘  └───────┬───────┘  │  │
│  └────────────┼───────────────────────┼─────────────────────┼──────────┘  │
│               │                       │                     │            │
│  ┌────────────┼───────────────────────┼─────────────────────┼──────────┐  │
│  │            │       Dev-Intel Service Layer               │          │  │
│  │            │                       │                     │          │  │
│  │  ┌─────────┴──────────┐  ┌────────┴──────────┐  ┌───────┴───────┐  │  │
│  │  │   Memory Service   │  │  Resume Service   │  │  Activity     │  │  │
│  │  │  sources + store   │  │  generator        │  │  recorder     │  │  │
│  │  └─────────┬──────────┘  └───────────────────┘  └───────┬───────┘  │  │
│  │            │                                              │         │  │
│  │  ┌─────────┴──────────────────────────────────────────────┴───────┐ │  │
│  │  │                Observer Layer                                  │ │  │
│  │  │  subscribes to EventV2, bridges to Dev-Intel events           │ │  │
│  │  └──────────────────────────────┬─────────────────────────────────┘ │  │
│  └─────────────────────────────────┼───────────────────────────────────┘  │
│                                    │                                      │
│  ┌─────────────────────────────────┼───────────────────────────────────┐  │
│  │          OpenCode Core          │                                   │  │
│  │                                 │                                   │  │
│  │  ┌──────────────────────────────┴────────────────────────────────┐  │  │
│  │  │               EventV2 (event sourcing)                       │  │  │
│  │  │  Session.* │ Tool.* │ Prompt.* │ Text.* │ Reasoning.*        │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │         SystemContextRegistry (context sources)              │  │  │
│  │  │  core/environment │ core/date │ dev-intel/project-memory    │  │  │
│  │  │  dev-intel/session-memory │ dev-intel/developer-profile     │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │               SessionRunner (llm.ts)                          │  │  │
│  │  │  loads SystemContext → builds LLM.request() → streams        │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
