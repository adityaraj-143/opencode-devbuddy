export type MemoryType = "project" | "session" | "developer" | "learned" | "observation"

export type MemorySource = "explicit" | "inferred" | "analysis" | "observation"

export type ActivityType =
  | "file_read" | "file_write" | "file_edit" | "file_delete"
  | "tool_call" | "shell_command" | "web_search" | "web_fetch"
  | "branch_change" | "git_commit" | "git_checkout"
  | "session_start" | "session_end"
  | "prompt_sent" | "response_received"

export type ActivityCategory = "file" | "tool" | "git" | "session"

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled" | "blocked"

export type DecisionStatus = "proposed" | "accepted" | "deprecated" | "superseded"
