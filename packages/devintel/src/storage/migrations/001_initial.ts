import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export const initialSchema = {
  id: "20260614_001_dev_intel_initial",
  up(tx) {
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
      yield* tx.run(`
        CREATE TABLE \`dev_intel_memory_entry\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text REFERENCES \`dev_intel_project\`(\`id\`),
          \`session_id\` text,
          \`memory_type\` text NOT NULL,
          \`content\` text NOT NULL,
          \`source\` text DEFAULT 'inferred' NOT NULL,
          \`importance\` real DEFAULT 0.5 NOT NULL,
          \`access_count\` integer DEFAULT 0 NOT NULL,
          \`last_accessed_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`idx_mem_project\` ON \`dev_intel_memory_entry\`(\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`idx_mem_session\` ON \`dev_intel_memory_entry\`(\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`idx_mem_type\` ON \`dev_intel_memory_entry\`(\`memory_type\`);`)
      yield* tx.run(`
        CREATE TABLE \`dev_intel_session\` (
          \`id\` text PRIMARY KEY,
          \`opencode_session_id\` text,
          \`project_id\` text REFERENCES \`dev_intel_project\`(\`id\`),
          \`branch_name\` text,
          \`started_at\` integer NOT NULL,
          \`ended_at\` integer,
          \`message_count\` integer DEFAULT 0 NOT NULL,
          \`tool_call_count\` integer DEFAULT 0 NOT NULL,
          \`summary\` text,
          \`task_description\` text,
          \`resolved\` integer DEFAULT 0 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`dev_intel_activity\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text REFERENCES \`dev_intel_project\`(\`id\`),
          \`session_id\` text REFERENCES \`dev_intel_session\`(\`id\`),
          \`activity_type\` text NOT NULL,
          \`category\` text NOT NULL,
          \`detail_json\` text NOT NULL,
          \`occurred_at\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`idx_activity_project\` ON \`dev_intel_activity\`(\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`idx_activity_session\` ON \`dev_intel_activity\`(\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`idx_activity_time\` ON \`dev_intel_activity\`(\`occurred_at\`);`)
      yield* tx.run(`CREATE INDEX \`idx_activity_type\` ON \`dev_intel_activity\`(\`activity_type\`);`)
      yield* tx.run(`
        CREATE TABLE \`dev_intel_developer_profile\` (
          \`key\` text PRIMARY KEY,
          \`value_json\` text NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
} satisfies { id: string; up: (tx: any) => Effect.Effect<void> }
