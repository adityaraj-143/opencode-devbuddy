import { Effect } from "effect"

export const initialSchema = {
  id: "20260614_001_dev_intel_project",
  up(tx: any) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`dev_intel_project\` (
          \`id\` text PRIMARY KEY,
          \`opencode_project_id\` text,
          \`worktree_path\` text NOT NULL,
          \`name\` text NOT NULL,
          \`vcs_type\` text DEFAULT 'git' NOT NULL,
          \`vcs_remote\` text,
          \`last_opened_at\` integer,
          \`times_opened\` integer DEFAULT 0 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
} satisfies { id: string; up: (tx: any) => Effect.Effect<void> }
