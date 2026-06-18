# Phase 2: Project Memory — Complete Summary

## Overview

Phase 2 adds persistent, file-based project memory to every registered Dev-Intel project. Each project gets a `.devintel/` directory in its worktree root with four JSON files: `project.json`, `tasks.json`, `decisions.json`, and `notes.json`. These files are human-editable, version-controllable, and survive restarts.

This builds on Phase 1's Project Registry — memory is associated with registered projects via their `projectId`.

---

## What Was Built

### Package: `@opencode-ai/devintel` (`packages/devintel/`)

Three new modules in `src/memory/`:

### 1. Types (`src/memory/types.ts`)

Shared type definitions for all memory entities:

| Type | Fields |
|------|--------|
| `ProjectMetadata` | `name`, `description`, `goals`, `constraints`, `createdAt`, `updatedAt` |
| `Task` | `id`, `title`, `description`, `status` (todo/active/completed), `createdAt`, `updatedAt` |
| `Decision` | `id`, `title`, `rationale`, `timestamp` |
| `Note` | `id`, `content`, `createdAt`, `updatedAt` |
| `ProjectMemory` | Aggregate: `metadata + tasks + decisions + notes` |

### 2. Filesystem Layer (`src/memory/memory-fs.ts`)

Low-level file operations for `.devintel/` directories:

- `ensureDir(path)` — Creates `.devintel/` with `mkdir({ recursive: true })`
- `readJSON<T>(path, name, fallback)` — Reads and parses JSON; returns fallback on `ENOENT`
- `writeJSON(path, name, data)` — Atomically writes pretty-printed JSON
- `ensureFile(path, name, defaults)` — Creates a file only if it does NOT exist (no overwrite)

### 3. Service (`src/memory/project-memory.ts`)

`DevIntelProjectMemory` — the main public API, registered as `@opencode/v2/devintel/ProjectMemory`.

Service tag and Effect service following the self-export pattern (`export * as DevIntelProjectMemory`).

#### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `initialize` | `(projectId) => Effect.Effect<void, any, any>` | Creates `.devintel/` and all 4 JSON files with defaults if they do not exist. Idempotent — does not overwrite existing files. |
| `getProjectMemory` | `(projectId) => Effect.Effect<ProjectMemory, any, any>` | Reads all 4 files and returns a combined snapshot. Creates `.devintel/` lazily if missing. |
| `updateMetadata` | `(projectId, { name?, description?, goals?, constraints? }) => Effect.Effect<ProjectMetadata, any, any>` | Merges partial updates into `project.json`. Preserves unset fields. |
| `addTask` | `(projectId, { title, description? }) => Effect.Effect<Task, any, any>` | Appends a new task with status `"todo"`, generates `t_`-prefixed ID. |
| `updateTask` | `(projectId, taskId, { title?, description?, status? }) => Effect.Effect<Task, any, any>` | Finds task by ID and applies partial updates. Throws if task not found. |
| `addDecision` | `(projectId, { title, rationale }) => Effect.Effect<Decision, any, any>` | Appends a new decision with `d_`-prefixed ID. |
| `addNote` | `(projectId, content) => Effect.Effect<Note, any, any>` | Appends a new note with `n_`-prefixed ID. |

All methods resolve the project's `worktreePath` from the Project Registry (`DevIntelProjects.Service`) and fail with `ProjectNotFound` for unknown IDs.

#### File Format (`.devintel/`)

```
<worktree>/
└── .devintel/
    ├── project.json        # { name, description, goals: [], constraints: [], createdAt, updatedAt }
    ├── tasks.json          # { tasks: [{ id, title, description, status, createdAt, updatedAt }] }
    ├── decisions.json      # { decisions: [{ id, title, rationale, timestamp }] }
    └── notes.json          # { notes: [{ id, content, createdAt, updatedAt }] }
```

All files use 2-space pretty-printed JSON. Files are only created when missing — never overwritten.

---

## Files Changed

### New Files (3)

| File | Purpose |
|------|---------|
| `packages/devintel/src/memory/types.ts` | Shared type definitions |
| `packages/devintel/src/memory/memory-fs.ts` | File operations for `.devintel/` |
| `packages/devintel/src/memory/project-memory.ts` | Main service (self-export pattern, Interface, Service, layer) |

### Modified Files (3)

| File | Change |
|------|--------|
| `packages/devintel/src/index.ts` | Added exports for `DevIntelProjectMemory` and all memory types |
| `packages/devintel/src/layer.ts` | Added `DevIntelProjectMemory.Service` to the merged layer |
| `packages/devintel/src/observer/session-observer.ts` | Added `memory.initialize(projectId)` call after `ensureRegistered()` — auto-creates `.devintel/` when a session is first admitted in a project |

---

## Architecture Decisions

### Why File-Based (`.devintel/`) Instead of SQLite?

Per the integration plan, project memory uses `.devintel/` files rather than SQLite for these reasons:

1. **Human-editable** — Developers can edit `project.json`, `tasks.json`, etc. directly in their editor
2. **Version-controllable** — `.devintel/` can be committed to the repository, sharing project context with the team
3. **No migration needed** — JSON files are self-describing; no schema migrations required
4. **Simple recovery** — If files are deleted, they are re-created with defaults
5. **Alignment with Phase 3+** — The `.devintel/` directory structure was already planned in the integration guide

SQLite remains the right choice for the Project Registry (which needs queries and joins). File storage is right for project memory (which needs human access).

### Why Lazy Initialization?

The `.devintel/` directory is created lazily — `getProjectMemory` and other APIs auto-create it if missing. This avoids creating empty directories for projects that are never actively used. The observer also calls `initialize` on session admission, so real usage always triggers creation.

### Why the Observer Integration?

The `session-observer.ts` already watches `SessionEvent.PromptLifecycle.Admitted` events and calls `ensureRegistered`. Adding `memory.initialize(projectId)` after registration means `.devintel/` is created automatically during normal OpenCode usage — no manual setup required.

### Error Handling

- `ProjectNotFound` (from `core/errors.ts`) is yielded via `Effect.fail` for unknown project IDs
- File system errors (read/write failures, permission issues, malformed JSON) propagate as defects via `Effect.promise` — they are real problems that should surface
- Missing files on read return defaults rather than failing (graceful degradation)
- `initialize` is fully idempotent — `ensureFile` only writes if the file does not exist

---

## Tests

8 new tests in `packages/devintel/test/memory.test.ts`:

| Test | What It Verifies |
|------|-----------------|
| `initializes .devintel directory and files` | Files are created with default/empty values |
| `is idempotent — repeated initialize does not overwrite` | Calling `initialize` again after updates preserves data |
| `updateMetadata persists changes` | Partial updates merge correctly |
| `addTask creates a task with todo status` | IDs start with `t_`, status defaults to `"todo"` |
| `updateTask changes status and title` | Partial updates to task fields work |
| `addDecision stores architectural decisions` | IDs start with `d_` |
| `addNote stores developer notes` | IDs start with `n_` |
| `fails for unknown project ID` | `ProjectNotFound` error thrown for invalid IDs |

All tests use an in-memory SQLite database (`:memory:`) for the Project Registry and a `mkdtemp` temporary directory as the project worktree.

---

## Dependency Graph

```
DevIntelProjectMemory.Service
  └── requires DevIntelProjects.Service   (to resolve worktreePath from projectId)
  └── requires DevIntelDb.Service          (transitively, via DevIntelProjects)

observerLayer
  └── requires DevIntelProjects.Service
  └── requires DevIntelProjectMemory.Service
  └── requires EventV2.Service
```

---

## Future Integration Points (Phase 3+)

| Phase | Dependency on Phase 2 |
|-------|----------------------|
| **Phase 3 (Session Tracking)** | Read `.devintel/tasks.json` to associate current work with tracked tasks |
| **Phase 4 (Resume Briefings)** | Read `.devintel/` memory to include project context in resume |
| **Phase 7 (Memory Injection)** | Load `.devintel/` files as `SystemContext.Source` for LLM context injection |
| **TUI Enhancements** | Display `.devintel/` contents in the Dev-Intel sidebar panel |
