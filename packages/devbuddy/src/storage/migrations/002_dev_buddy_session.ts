import { Effect } from "effect"

export const sessionSchema = {
  id: "20260614_002_dev_buddy_session",
  up(tx: any) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`dev_buddy_session\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`started_at\` integer NOT NULL,
          \`ended_at\` integer,
          \`active_branch\` text,
          \`current_task_id\` text,
          \`files_touched\` text NOT NULL DEFAULT '[]',
          \`tools_used\` text NOT NULL DEFAULT '[]',
          \`messages_sent\` integer NOT NULL DEFAULT 0,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
} satisfies { id: string; up: (tx: any) => Effect.Effect<void, unknown, unknown> }
