import { Schema } from "effect"

export const NonEmptyString = Schema.NonEmptyString

export const UnixTimestamp = Schema.Number.pipe(Schema.int(), Schema.nonNegative())

export const Importance = Schema.Number.pipe(Schema.between(0, 1))

export const MemoryType = Schema.Literal("project", "session", "developer", "learned", "observation")

export const MemorySource = Schema.Literal("explicit", "inferred", "analysis", "observation")

export const ActivityType = Schema.Literal(
  "file_read", "file_write", "file_edit", "file_delete",
  "tool_call", "shell_command", "web_search", "web_fetch",
  "branch_change", "git_commit", "git_checkout",
  "session_start", "session_end",
  "prompt_sent", "response_received",
)

export const TaskStatus = Schema.Literal("open", "in_progress", "done", "cancelled", "blocked")

export const DecisionStatus = Schema.Literal("proposed", "accepted", "deprecated", "superseded")
