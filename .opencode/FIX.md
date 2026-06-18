# SIGABRT Crash: Diagnosis & Fix

## The Problem

Running `bun dev` on the `dev` branch produced:

```
error: script "dev" was terminated by signal SIGABRT (Abort)
Abort (core dumped)
```

The crash occurred immediately during TUI startup — the terminal would enter alternate screen mode, enable mouse tracking, send capability queries, and then abort. No JavaScript stack trace was produced; only raw ANSI escape sequences appeared before the SIGABRT signal.

## Reproduction

- **Always crashes**: Every run on the `dev` branch.
- **Not caused by our code**: The crash reproduced on the parent commit (`85e278b72` "sync release versions for v1.17.7") which has **zero** devbuddy changes.
- **Does NOT crash on the actual v1.17.7 release**: The upstream tag `v1.17.7` (`4ed4f749e`) worked fine. The difference was that our repo's base commit `85e278b72` was **not** the actual release — it was a "sync release versions" commit that diverged from `4ed4f749e` despite having the same tree content.
- **Actually WAS our imports**: After rebasing onto the real `v1.17.7`, the crash persisted — ultimately traced to the two static `import` statements we added for devbuddy integration.

## Root Cause

### The Immediate Trigger

Two static import lines pulled `@opencode-ai/devbuddy` into the app's module graph at **load time** (before any code ran):

```typescript
// packages/opencode/src/effect/app-runtime.ts:54
import { DevBuddyLayer } from "@opencode-ai/devbuddy"

// packages/tui/src/feature-plugins/builtins.ts:14
import { plugin as DevBuddyPlugin } from "@opencode-ai/devbuddy/tui"
```

Importing `@opencode-ai/devbuddy` transitively loaded `@opentui/core` and `@opentui/solid` (devbuddy's dependencies). These libraries perform terminal capability detection and initialization at module evaluation time — specifically, they query the terminal for supported features (alternate screen buffer, mouse tracking, synchronized output, etc.) using ANSI escape sequences.

### Why It Crashed

Bun 1.3.14 has a compatibility issue where this terminal initialization sequence causes a **SIGABRT** (abort signal from the C/C++ runtime). This is not a JavaScript error — it's a native crash in bun's internal terminal handling code, likely triggered by:

1. The terminal being put into raw/alternate-screen mode
2. Concurrent access to terminal file descriptors during module evaluation
3. A race condition or improper state handling in bun's TTY layer when `@opentui/solid`'s initialization runs during module loading rather than during controlled startup

The crash did **not** happen when the TUI's own `@opentui` imports were loaded during normal app initialization (via `@opencode-ai/tui` which also depends on `@opentui/core` and `@opentui/solid`). The difference was **timing** — importing through the devbuddy path caused the libraries to be evaluated at a different point in the module resolution order, triggering the bun bug.

## Attempted Fixes That Didn't Work

### 1. `Layer.unwrap` with `Effect.promise`

```typescript
Layer.provideMerge(
  Layer.unwrap(
    Effect.promise(async () => {
      const { DevBuddyLayer } = await import("@opencode-ai/devbuddy")
      return DevBuddyLayer.layer
    }),
  ) as Layer.Layer<any, never, never>,
)
```

**Why it failed**: `ManagedRuntime.make(AppLayer)` eagerly builds all layers, including unwrapped ones. The `Effect.promise` was evaluated during layer construction at startup, which triggered the same dynamic `import()`, loading devbuddy and its `@opentui` dependencies at startup time anyway.

### 2. Dynamic import in `createBuiltinPlugins`

Attempting `await import("@opencode-ai/devbuddy/tui")` inside the `createBuiltinPlugins()` function also failed because the function was called early enough in the TUI startup that the crash still occurred.

## The Working Fix

### Strategy: Defer the import to plugin activation time

Instead of loading devbuddy at module load time or even at layer construction time, defer it to when the TUI plugin is **actually activated** — when the user navigates to the devbuddy sidebar panel.

**In `packages/tui/src/feature-plugins/builtins.ts`:**

Replaced the static import:

```typescript
// BEFORE: Loaded at module evaluation time
import { plugin as DevBuddyPlugin } from "@opencode-ai/devbuddy/tui"
```

With a lazy wrapper that only imports when the plugin runs:

```typescript
// AFTER: Only imports when the plugin's tui() is called
const DevBuddyPlugin: BuiltinTuiPlugin = {
  id: "internal:devbuddy",
  tui: async (...args: Parameters<TuiPlugin>) => {
    const { plugin } = await import("@opencode-ai/devbuddy/tui")
    return plugin.tui(...args)
  },
}
```

**In `packages/opencode/src/effect/app-runtime.ts`:**

Removed the devbuddy layer entirely from `AppLayer`. Since the devbuddy services (`DevBuddyDb`, `DevBuddyProjects`) are only needed when the TUI plugin runs, not at app startup, they can be created on-demand by the plugin when it initializes. This avoids the `Layer.unwrap` issue where `ManagedRuntime.make` eagerly evaluates all layers.

### Key Concept: Deferred Module Evaluation

The fundamental principle at play is **when** module side effects execute:

| Approach | When import() executes | Result |
|----------|----------------------|--------|
| Static `import` at top of file | Module load time (immediate) | CRASH |
| `Layer.unwrap` + `Effect.promise` | Layer build time (startup) | CRASH |
| Dynamic `import()` inside `tui()` | Plugin activation time (on-demand) | WORKS |

Module resolution in JavaScript is eager by default — static `import` declarations are evaluated when the importing module is first loaded. Dynamic `import()` expressions are evaluated when the code reaches them at runtime. By moving the devbuddy import from "module load time" to "plugin activation time", we avoided the bun 1.3.14 terminal initialization bug entirely.

### Why Not Just Move `@opentui` to `devDependencies`?

`@opentui/core` and `@opentui/solid` are genuine runtime dependencies for the TUI plugin's JSX rendering. Moving them to `devDependencies` would not have worked — they'd be missing at import time. The issue is not about **whether** they're present, but **when** they're loaded.

## Verification

- `bun dev` starts successfully on the `dev` branch
- Dev-Buddy TUI plugin is registered in the builtins list
- The plugin is only loaded when the user navigates to the devbuddy sidebar panel
- All 23 turbo typecheck tasks pass
- 4 devbuddy smoke tests pass with in-memory SQLite

## Lessons Learned

1. **`Layer.unwrap` does not defer module loading** — `ManagedRuntime.make` eagerly builds all layers, including unwrapped ones. Dynamic imports inside `Layer.unwrap` still execute at startup.

2. **Static imports are not lazy** — even if the imported module is only used in one code path, the entire module graph is resolved and evaluated at load time.

3. **Module-load-time side effects are dangerous** — libraries that perform terminal I/O, file system operations, or other ambient state changes at module evaluation time can behave unpredictably depending on module resolution order.

4. **Dynamic `import()` is the correct deferral mechanism** — it delays evaluation until the code actually reaches that expression at runtime, bypassing the eager module resolution of static imports.
